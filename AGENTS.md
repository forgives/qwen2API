# qwen2API 架构概述

## 项目概述

qwen2API 是一个企业级 API 网关，将通义千问（chat.qwen.ai）网页版能力转换为 OpenAI、Claude 和 Gemini 兼容的 API 接口。项目采用前后端分离架构：

- **后端**: Python 3.10+ (FastAPI + Uvicorn + Camoufox 无头浏览器引擎)
- **前端**: React 19 + Vite 6 + Shadcn UI + TailwindCSS 4

### 核心架构组件

```
backend/
├── main.py              # FastAPI 应用入口，路由挂载，生命周期管理
├── core/
│   ├── config.py        # 全局配置与环境变量
│   ├── database.py      # 异步 JSON 数据库（带锁持久化）
│   ├── account_pool.py  # 账号池与并发控制
│   ├── browser_engine.py    # Camoufox 无头浏览器引擎
│   ├── httpx_engine.py      # HTTPX 直连引擎
│   └── hybrid_engine.py     # 混合引擎（浏览器优先，HTTPX 兜底）
├── services/
│   ├── qwen_client.py       # 千问 API 客户端，流式解析与重试机制
│   ├── auth_resolver.py     # 自动登录、凭证自愈、账号激活
│   ├── tool_parser.py       # Tool Calling 解析与格式纠正
│   ├── prompt_builder.py    # 消息转换为千问 Prompt
│   ├── token_calc.py        # Tiktoken 精准计费
│   └── garbage_collector.py # 孤儿会话清理（15分钟定时）
└── api/
    ├── v1_chat.py       # OpenAI 兼容接口
    ├── anthropic.py     # Claude 兼容接口
    ├── gemini.py        # Gemini 兼容接口
    ├── images.py        # 图片生成接口
    ├── embeddings.py    # Embeddings 接口
    ├── admin.py         # Admin API
    └── probes.py        # 健康检查

frontend/
├── src/
│   ├── pages/           # 页面组件（Dashboard, Accounts, Tokens, Settings, Test）
│   ├── layouts/         # 布局组件
│   ├── lib/             # API 客户端与工具函数
│   └── components/ui/   # Shadcn UI 组件
└── vite.config.ts       # Vite 配置
```

### 关键设计模式

1. **引擎抽象**: 三种引擎模式可切换
   - `browser`: Camoufox 无头浏览器，绕过 WAF，防封控
   - `httpx`: HTTPX 直连，速度快，适合低频场景
   - `hybrid`: 混合模式，API 调用优先 httpx，会话管理走浏览器

2. **账号池与并发控制**:
   - 每个账号维护 `inflight` 计数器和 `rate_limited_until` 时间戳
   - 支持最小请求间隔 (`ACCOUNT_MIN_INTERVAL_MS`) 和抖动 (`REQUEST_JITTER_*`)
   - 自动标记限流、封禁、待激活状态

3. **无感容灾重试**:
   - 请求失败时自动从账号池排除问题账号
   - 支持凭证自愈（自动登录刷新 Token）
   - 支持账号激活（从临时邮箱获取验证链接）

4. **Tool Calling 实现**:
   - 支持 `##TOOL_CALL##`、`<tool_call`、代码块等多种格式
   - 原生工具调用透传 (`NATIVE_TOOL_PASSTHROUGH`)
   - 检测到上游拦截时注入格式纠正提示

---

## 构建与命令

### 本地开发

```bash
# 一键启动（自动安装依赖、下载浏览器内核、构建前端）
python start.py

# 前端开发服务器: http://127.0.0.1:5174
# 后端 API: http://127.0.0.1:7860
```

### Docker 部署

```bash
# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f

# 服务地址: http://127.0.0.1:7860
```

### 前端独立构建

```bash
cd frontend
npm install
npm run build    # 构建产物到 frontend/dist/
npm run dev      # 开发服务器
```

### 后端独立启动

```bash
cd backend
pip install -r requirements.txt
python -m camoufox fetch  # 下载浏览器内核
cd ..
python -m uvicorn backend.main:app --host 0.0.0.0 --port 7860 --workers 1
```

### 健康检查

```bash
curl http://localhost:7860/healthz  # 存活探针
curl http://localhost:7860/readyz   # 就绪探针
```

---

## 代码风格

### Python 后端

- **格式化**: 遵循 PEP 8，使用 4 空格缩进
- **异步优先**: 所有 I/O 操作使用 `async/await`
- **日志规范**: 使用 `logging.getLogger("qwen2api.{module}")`
- **类型注解**: 关键函数使用类型提示
- **错误处理**: 使用自定义异常消息，避免裸 `Exception`

### TypeScript 前端

- **框架**: React 19 + TypeScript
- **样式**: TailwindCSS 4 + Shadcn UI
- **路由**: React Router DOM 7
- **状态管理**: 组件内 useState，无全局状态库
- **API 调用**: fetch 封装在 `frontend/src/lib/api.ts`

### 命名约定

- Python 文件: 小写下划线 (`tool_parser.py`)
- Python 类: 大驼峰 (`AccountPool`, `QwenClient`)
- TypeScript 组件: 大驼峰 (`Dashboard.tsx`, `AccountsPage.tsx`)
- 环境变量: 大写下划线 (`ADMIN_KEY`, `ENGINE_MODE`)

---

## 测试

### 当前状态

项目目前无自动化测试套件。建议在以下场景手动测试：

1. **API 兼容性测试**:
   - OpenAI SDK (Python/Node.js)
   - Anthropic SDK
   - Google Gemini SDK
   - Vercel AI SDK

2. **流式响应测试**:
   - SSE 连接稳定性
   - Keepalive 心跳
   - 超时处理

3. **账号管理测试**:
   - 账号添加/删除
   - 限流自动标记
   - 凭证自愈

4. **Tool Calling 测试**:
   - 多轮工具调用
   - JSON 格式纠正
   - 重复调用拦截

### 测试命令示例

```bash
# OpenAI 兼容接口
curl http://localhost:7860/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}], "stream": true}'

# 图片生成接口
curl http://localhost:7860/v1/images/generations \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "dall-e-3", "prompt": "a cat", "n": 1, "size": "1024x1024"}'
```

---

## 安全

### 关键安全措施

1. **API Key 鉴权**:
   - 支持 `Authorization: Bearer` 和 `x-api-key` 两种方式
   - Admin Key 与用户 Token 分离
   - 配额检查 (`quota` vs `used_tokens`)

2. **数据保护**:
   - `data/` 目录包含敏感凭证，需妥善保管
   - 账号 Token、Cookies 存储在 `accounts.json`
   - 用户配额存储在 `users.json`

3. **上游安全**:
   - Camoufox 浏览器指纹伪装，绕过 Aliyun WAF
   - 请求抖动 (`REQUEST_JITTER_*`) 降低自动化痕迹
   - 最小请求间隔 (`ACCOUNT_MIN_INTERVAL_MS`) 防封控

4. **凭证自愈**:
   - 自动检测 401/403 错误
   - 后台异步刷新 Token
   - 支持邮箱激活流程

### 安全建议

- **生产环境必须修改 `ADMIN_KEY`**
- 使用 HTTPS 反向代理
- 定期备份 `data/` 目录
- 监控账号状态，及时移除封禁账号

---

## 配置

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 7860 | 服务端口 |
| `ADMIN_KEY` | admin | 管理员密钥（**必须修改**） |
| `REGISTER_SECRET` | "" | 注册密钥 |
| `ENGINE_MODE` | hybrid | 引擎模式: browser/httpx/hybrid |
| `BROWSER_POOL_SIZE` | 2 | 浏览器页面池大小 |
| `MAX_INFLIGHT` | 1 | 单账号最大并发 |
| `ACCOUNT_MIN_INTERVAL_MS` | 1200 | 账号最小请求间隔（毫秒） |
| `REQUEST_JITTER_MIN_MS` | 120 | 请求抖动下限 |
| `REQUEST_JITTER_MAX_MS` | 360 | 请求抖动上限 |
| `NATIVE_TOOL_PASSTHROUGH` | true | 原生工具调用透传 |

### 数据文件

| 文件路径 | 说明 |
|----------|------|
| `data/accounts.json` | 上游千问账号池 |
| `data/users.json` | 下游用户与配额 |
| `data/config.json` | 运行时配置（可选） |
| `data/captures.json` | 抓包记录 |

### 模型映射

所有请求的模型名会自动映射到 `qwen3.6-plus`：

- OpenAI: `gpt-4o`, `gpt-4-turbo`, `o1`, `o3` 等
- Claude: `claude-3-5-sonnet`, `claude-opus-4-6` 等
- Gemini: `gemini-2.5-pro`, `gemini-1.5-flash` 等
- DeepSeek: `deepseek-chat`, `deepseek-reasoner`

图片模型映射：
- `dall-e-3`, `qwen-image` → `wanx2.1-t2i-plus`
- `dall-e-2`, `qwen-image-turbo` → `wanx2.1-t2i-turbo`

### 推荐配置（单账号）

```
ENGINE_MODE=hybrid
BROWSER_POOL_SIZE=2
MAX_INFLIGHT=1
ACCOUNT_MIN_INTERVAL_MS=1200
REQUEST_JITTER_MIN_MS=120
REQUEST_JITTER_MAX_MS=360
MAX_RETRIES=2
TOOL_MAX_RETRIES=2
```

---

## 常见问题

### 浏览器引擎启动失败

- 检查 Docker `shm_size` 配置（建议 256m+）
- 确认 Camoufox 内核已下载：`python -m camoufox fetch`

### 账号被限流

- 增大 `ACCOUNT_MIN_INTERVAL_MS`
- 降低 `MAX_INFLIGHT`
- 增加账号池规模

### Tool Calling 格式错误

- 检查 `NATIVE_TOOL_PASSTHROUGH` 配置
- 查看日志中的 `[ToolParse]` 输出
- 确认上游返回的格式

### 图片生成超时

- 图片生成耗时 15-45 秒属正常
- 检查账号是否有 T2I 权限
- 查看日志中的 `[T2I]` 输出
