# PRD: Sidecar 状态枚举化重构

> **Version**: 0.1.58 (planned)
> **Status**: Draft
> **Created**: 2026-04-01
> **Priority**: Medium — 不影响当前正确性，但消除架构债务

---

## 1. 问题背景

### 1.1 触发事件

v0.1.57 用户报告：快速切换工作区/Tab 时应用冻结 5 分钟（macOS 彩虹光标）。

### 1.2 根因链路

```
用户快速 open/close Tab
  → ensure_session_sidecar 获取锁，提取 port=31425
  → 释放锁，做 HTTP Health Check（2 秒窗口）
  → 期间 Health Monitor 检测 Sidecar 已死
  → Monitor 删除旧 Sidecar，创建新的 port=31426
  → ensure_session_sidecar 重新获取锁
  → 盲目 remove(session_id) → 误杀 Monitor 刚创建的健康 Sidecar
  → 创建第三个 Sidecar → wait_for_health 5 分钟超时
  → 应用冻结
```

核心矛盾：`ensure_session_sidecar` 在 HTTP Health Check 期间必须释放 Mutex（否则阻塞所有 Sidecar 操作 2 秒），但释放后状态可能已被其他线程改变。

### 1.3 深层架构问题

`SessionSidecar` 用 `healthy: bool` 表达三种实际状态：

| 实际状态 | `healthy` | `process.try_wait()` | 含义 |
|---------|-----------|---------------------|------|
| **Starting** | `false` | `Ok(None)` — 进程存活 | 正在 `wait_for_health`，尚未就绪 |
| **Healthy** | `true` | `Ok(None)` — 进程存活 | 正常服务中 |
| **Dead** | `false` | `Ok(Some(_))` — 进程已退出 | 需要回收/重建 |

`is_running()` 方法在 `healthy=false` 时直接返回 `false`，不区分 Starting 和 Dead。这导致其他线程看到 Starting 状态的 Sidecar 时误判为 Dead 并杀掉它。

---

## 2. v0.1.57 修复现状

### 2.1 已实施的修复

| 防护 | 机制 | 文件位置 |
|------|------|---------|
| Generation Counter | `SidecarManager.sidecar_generations: HashMap<String, u64>`，每次创建 Sidecar +1，锁间隙前后对比检测替换 | `sidecar.rs:530` |
| `is_process_alive()` | 新方法，仅检查进程存活（`try_wait`），不看 `healthy` 标志 | `sidecar.rs:389` |
| 双重创建防护 | `create_new_session_sidecar` 入口检查 `is_running() \|\| is_process_alive()`，已有存活 Sidecar 就复用 | `sidecar.rs:2370` |
| Generation 生命周期对齐 | `upgrade_session_id` 迁移、`stop_all` 清理、`release_session_sidecar` 清理 | 多处 |

### 2.2 覆盖的竞态窗口

- HTTP Health Check 2s 锁间隙（替代品 Healthy 或 Starting）
- `wait_for_health` 5 分钟锁间隙
- Health Monitor 并发恢复
- 双重创建
- Session ID 升级

### 2.3 残留技术债

**债务 1：`healthy: bool` 状态坍缩**

`is_process_alive()` 通过 `try_wait()` 运行时探测来区分 Starting 和 Dead，而非显式状态标记。理论上存在极窄竞态窗口（纳秒级）：进程恰好在 `is_process_alive()` 返回 `true` 和后续操作之间退出。实际影响为零，但代码语义不精确。

**债务 2：Generation Counter 外挂**

`sidecar_generations` 是独立 HashMap，需在每个 mutation 点手动同步。当前所有点已补全，但未来新增操作时可能遗忘。没有编译器强制保障。

**债务 3：`log::*` vs `ulog_*` 不一致**

`sidecar.rs` 中 131 处 `log::*` vs 18 处 `ulog_*`，混用。CLAUDE.md 要求统一用 `ulog_*`。需要单独的批量迁移。

---

## 3. 目标架构（0.1.58）

### 3.1 SidecarState 枚举

将 `healthy: bool` 替换为显式三态枚举：

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SidecarState {
    /// 进程已启动，正在 wait_for_health，尚未就绪
    Starting,
    /// HTTP Health Check 通过，正常服务中
    Healthy,
    /// 进程已退出或 Health Check 持续失败
    Dead,
}

pub struct SessionSidecar {
    process: Child,
    port: u16,
    session_id: String,
    workspace_path: PathBuf,
    state: SidecarState,          // 替代 healthy: bool
    owners: HashSet<SidecarOwner>,
    created_at: std::time::Instant,
}
```

### 3.2 方法重构

```rust
impl SessionSidecar {
    /// 是否可以被复用（接受新 owner）
    fn is_reusable(&self) -> bool {
        matches!(self.state, SidecarState::Healthy)
    }

    /// 是否应该等待（进程在启动中，不要杀）
    fn is_starting(&self) -> bool {
        matches!(self.state, SidecarState::Starting)
    }

    /// 是否需要回收（进程已死）
    fn is_dead(&mut self) -> bool {
        // 如果标记为 Dead，直接返回
        if self.state == SidecarState::Dead { return true; }
        // 如果标记为 Starting 或 Healthy，检查进程是否实际退出
        if let Ok(Some(_)) = self.process.try_wait() {
            self.state = SidecarState::Dead;
            return true;
        }
        false
    }

    // 删除 is_running() 和 is_process_alive()
    // 所有调用方改为 match self.state 或使用上述三个方法
}
```

### 3.3 ensure_session_sidecar 简化

```rust
// 当前代码（generation + is_process_alive 组合拳）
if post_gen != pre_gen {
    if let Some(sidecar) = manager_guard.sidecars.get_mut(session_id) {
        if sidecar.is_running() {
            // 复用
        }
        if sidecar.is_process_alive() {
            // 也复用（Starting 状态）
        }
    }
}

// 目标代码（枚举直接 match）
if post_gen != pre_gen {
    if let Some(sidecar) = manager_guard.sidecars.get_mut(session_id) {
        match sidecar.state {
            SidecarState::Healthy | SidecarState::Starting => {
                sidecar.add_owner(owner);
                return Ok(EnsureSidecarResult { port: sidecar.port, is_new: false });
            }
            SidecarState::Dead => { /* fall through to create */ }
        }
    }
}
```

### 3.4 Mutation 方法封装（可选）

将 `self.sidecars.insert()` / `self.sidecars.remove()` 封装为方法，内部自动维护 generation：

```rust
impl SidecarManager {
    fn insert_sidecar(&mut self, session_id: &str, sidecar: SessionSidecar) {
        self.next_generation(session_id);
        self.sidecars.insert(session_id.to_string(), sidecar);
    }

    fn remove_sidecar(&mut self, session_id: &str) -> Option<SessionSidecar> {
        self.sidecars.remove(session_id)
        // 不清理 generation — generation 需要在锁间隙后仍可查询
    }
}
```

这样任何 mutation 都自动维护 generation，无需在每个调用点手动同步。

### 3.5 日志统一

将 `sidecar.rs` 中所有 `log::info!` / `log::warn!` / `log::error!` 替换为 `ulog_info!` / `ulog_warn!` / `ulog_error!`，与 CLAUDE.md 规则对齐。

---

## 4. 实施计划

### Phase 1：SidecarState 枚举（核心）

1. 定义 `SidecarState` 枚举
2. `SessionSidecar` 的 `healthy: bool` → `state: SidecarState`
3. 替换所有 `sidecar.healthy = true/false` 为 `sidecar.state = SidecarState::Xxx`
4. 替换所有 `is_running()` 调用为 `is_reusable()` / `is_starting()` / `is_dead()`
5. 删除 `is_running()` 和 `is_process_alive()`（被枚举方法替代）

**影响范围**：仅 `sidecar.rs`，约 20-30 处改动。无前端影响。

### Phase 2：Mutation 方法封装（可选）

1. 新增 `insert_sidecar()` / `remove_sidecar()` 方法
2. 全局替换直接 `self.sidecars.insert/remove` 为方法调用
3. `insert_sidecar` 内部调用 `next_generation`

**影响范围**：仅 `sidecar.rs`，约 10 处改动。

### Phase 3：日志统一

1. 批量 `log::info!` → `ulog_info!` 等
2. 约 130 处替换

---

## 5. 风险评估

| 风险 | 概率 | 影响 | 缓解 |
|------|------|------|------|
| 枚举化遗漏某处 `healthy` 检查 | 低 | 中 | 编译器会报错（类型不匹配） |
| 行为语义变化 | 低 | 高 | 枚举是纯重构，不改变逻辑分支；`cargo test` + 手动测试快速切换 Tab |
| 日志替换影响格式 | 低 | 低 | `ulog_*` 和 `log::*` 格式一致 |

---

## 6. 验收标准

- [ ] `cargo check` 通过
- [ ] `sidecar.rs` 中无 `healthy: bool` 字段
- [ ] `sidecar.rs` 中无 `is_running()` / `is_process_alive()` 方法
- [ ] 所有状态检查使用 `is_reusable()` / `is_starting()` / `is_dead()` 或 `match sidecar.state`
- [ ] 快速切换 10+ 次工作区/Tab，无冻结
- [ ] 日志中 generation 变化日志正确输出
- [ ] `sidecar.rs` 中无 `log::info!`（全部迁移到 `ulog_info!`）
