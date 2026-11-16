# Long Conversations & Collection Limits

When a conversation grows very large, Antigravity Context enforces strict memory and IPC size budgets while polling local language-server snapshots and trajectory files so the host UI remains responsive.

## What happens when a conversation hits the collection limit

- **Complete statistics retained**: If a previous verified snapshot was collected before the limit was reached, Antigravity Context continues displaying the last complete statistics along with its timestamp rather than showing partial or corrupted numbers.
- **No partial guesses**: Incomplete or truncated paginated reads are discarded instead of mixing partial request counts into TPS, cache hit rate, or context breakdown figures.
- **Background completion**: When background pagination or disk scanning is allowed, collection resumes in bounded chunks without blocking the inline composer bar.

---

# 长对话与采集限制说明

当单个对话的轮次、步骤或请求记录体积非常大时，为了避免阻塞宿主渲染进程与本地统计轮询，Antigravity Context 会对单次采样的内存与序列化体积设置安全上限。

## 触发采集限制时的处理原则

- **保留最近一次完整统计**：如果此前已采集到完整、已校验的统计快照，界面会继续展示上一次完整统计及其更新时间。
- **丢弃不完整读取**：超过单次读取/字段预算的分页数据不会被强行拼装进 TPS、缓存命中率或上下文分段统计，避免产生失真结果。
- **后台分片补全**：在支持后台读取的情况下，任务会以受控分片继续补全，不影响正常对话输入。
