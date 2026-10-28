# 企业知识问答助手（Knowledge QA Assistant）

基于 **Turborepo monorepo** 的企业级 RAG 问答系统：员工上传文档 → 切分向量化存入 **Milvus** → 提问时检索相关分块，交给 **LangChain** 编排的大模型生成回答并附引用来源。

## 技术栈

| 层 | 选型 |
| --- | --- |
| Monorepo | pnpm workspace + Turborepo |
| 前端 | Next.js 15 (App Router) + React 19 |
| UI | Tailwind CSS 4 + shadcn 风格组件 + lucide-react |
| 状态/数据 | Zustand（客户端 UI 状态）+ TanStack Query（服务端数据） |
| AI 编排 | LangChain.js（ChatOpenAI 兼容协议，可接 OpenAI / DeepSeek / Ollama 本地模型） |
| 向量库 | Milvus standalone |
| 关系库 | PostgreSQL 16 + Drizzle ORM |
| 认证 | 独立 auth 子应用 + JWT + 父域名共享 Cookie |
| 基础设施 | docker-compose |

## 目录结构

```
knowledge-qa-assistant/
├── apps/
│   ├── web/                  # 主应用  app.lvh.me:3100（问答/知识库/模型设置）
│   └── auth/                 # 认证中心 auth.lvh.me:3001（注册/登录/退出）
├── packages/
│   ├── ui/                   # @kqa/ui        shadcn 风格组件 + 主题 tokens
│   ├── db/                   # @kqa/db        Drizzle schema + 连接客户端
│   ├── auth/                 # @kqa/auth      JWT 会话协议（签发/校验/cookie 约定）
│   ├── ai/                   # @kqa/ai        LangChain 封装：模型初始化/入库/RAG
│   └── tsconfig/             # @kqa/tsconfig  共享 TS 配置
├── docker-compose.yml        # postgres + etcd + minio + milvus
└── turbo.json
```

## 别名约定

- **包间引用**统一用 workspace 协议 + `@kqa/*` scope（如 `import { Button } from "@kqa/ui/components/button"`），Turborepo 依据它推导任务依赖图
- **app 内部引用**统一 `@/*` → `./src/*`（在各 app 的 tsconfig `paths` 中配置）
- 内部包直接导出 **TS 源码**（`"exports": "./src/*.ts"`），由消费方的 Next.js `transpilePackages` 编译，省去包的构建步骤

## 跨子域名认证原理

```
auth.lvh.me:3001 ──登录成功──> Set-Cookie: kqa_session=<JWT>; Domain=.lvh.me; HttpOnly
                                        │
app.lvh.me:3100 ──middleware 检查 cookie 存在──> 服务端用同一 AUTH_SECRET 校验 JWT
```

- cookie 写在**父域名** `.lvh.me` 上，所有子域名共享
- `lvh.me` 是通配 DNS，永远解析到 127.0.0.1，无需改 hosts；生产换成 `.your-domain.com`
- JWT 由 `jose` 用 HS256 签名，密钥 `AUTH_SECRET` 两个 app 共享，auth 与 web 零互调

## 快速开始

```bash
# 1. 安装依赖
pnpm install

# 2. 启动基础设施（postgres + etcd + minio + milvus）
pnpm docker:up

# 3. 初始化数据库表结构
pnpm db:generate && pnpm db:migrate

# 4. 配置环境变量
cp .env.example .env   # 修改 AUTH_SECRET 与 LLM/Embedding 的 key

# 5. 同时启动两个 app
pnpm dev
```

访问：

- 主应用：http://app.lvh.me:3100 （未登录自动跳转认证中心）
- 认证中心：http://auth.lvh.me:3001
- MinIO 控制台：http://localhost:9001 （minioadmin / minioadmin）

## 接入本地模型（如 Ollama）

在 web 应用「模型设置」页填写：

| 字段 | Ollama 示例 |
| --- | --- |
| LLM Base URL | `http://localhost:11434/v1` |
| LLM API Key | 任意非空值（本地不校验） |
| LLM 模型名 | `qwen3` |
| Embedding Base URL | `http://localhost:11434/v1` 或 bge-m3 服务地址 |
| Embedding 模型名 | `bge-m3` |

配置存 PostgreSQL `model_settings` 表，原样传给 LangChain 的 `ChatOpenAI` / `OpenAIEmbeddings` 初始化，保存即生效。

## 数据流

```
上传文档 ──> PG documents 表（元数据，status=pending）──> Redis 队列异步消费
                                                              │
                                    ┌─────────────────────────┘
                                    ▼
                        切分 + embedding ──> Milvus kqa_chunks 集合
                        （metadata 带 tenantId 隔离租户）
                                    │
                        status: pending → processing → ready / failed
                                    │
                        SSE（Redis pub/sub）实时推送状态到前端

提问 ──> Milvus 按 tenantId 过滤检索 top-4 ──> 拼装 prompt ──> LLM 流式回答 + 引用来源 ──> 落库 messages
```

## 本地调试指南

### 进入 Docker 查数据库

```bash
# 进入 Postgres 容器（交互式 psql）
docker exec -it kqa-postgres psql -U kqa -d kqa

# 常用 SQL（在 psql 里执行）
\dt                              -- 列出所有表
SELECT * FROM documents;          -- 查看文档（含 status / error 字段）
SELECT * FROM documents WHERE status = 'failed';   -- 只看失败的
SELECT * FROM tenants;
SELECT * FROM tenant_members;

# 不进入容器，直接在宿主机执行单条 SQL
docker exec kqa-postgres psql -U kqa -d kqa -c "SELECT filename, status, error FROM documents;"

# 查 Redis（队列和事件总线）
docker exec -it kqa-redis redis-cli
> llen kqa:document:queue         -- 队列里待处理的任务数
> keys "kqa:document:processing:*"  -- 正在处理的任务锁
> monitor                          -- 实时查看所有 Redis 命令（调试用）
```

### 文档处理失败怎么排查

文档状态流转：`pending → processing → ready / failed`。失败原因存在 `documents.error` 字段。

**第一步：看数据库里的错误信息**

```bash
docker exec kqa-postgres psql -U kqa -d kqa -c \
  "SELECT filename, status, error FROM documents WHERE status='failed' ORDER BY created_at DESC;"
```

常见错误对照表：

| error 内容 | 原因 | 解决办法 |
| --- | --- | --- |
| `Connection error.` | 网络连不上模型服务（国内直连 api.openai.com 会被墙） | 换国内可达的 OpenAI 兼容服务，或配代理 |
| `Request timed out.` | 请求超时，可能是代理慢或服务不可用 | 检查代理，或换 Embedding 服务 |
| `401 Unauthorized` | API Key 错误或失效 | 在「模型设置」页更新 key |
| `文档解析失败：...` | 文件格式损坏或加密 | 换文件重试 |
| `未解析出文本内容` | 扫描件 PDF（图片型），需要 OCR | 后续阶段支持 OCR |

**第二步：检查模型服务是否可达**

```bash
# 测试 Embedding 服务连通性（以 OpenAI 为例）
curl -s -o /dev/null -w "HTTP %{http_code}\n" --max-time 10 \
  https://api.openai.com/v1/models \
  -H "Authorization: Bearer $YOUR_API_KEY"

# HTTP 000 = 完全连不上（网络被墙 / 无代理）
# HTTP 401 = 连上了但 key 无效
# HTTP 200 = 正常
```

**第三步：看服务端日志**

```bash
# dev server 日志里搜队列消费日志
pnpm dev 2>&1 | grep "\[queue\]"

# 正常应该看到：
# [queue] consumer started, waiting for jobs...
# [queue] job dequeued: {"documentId":"..."}
# [queue] job done: <documentId>
```

### 国内网络环境推荐配置

`api.openai.com` 在国内直连不通（表现为 `Connection error.`）。推荐用**硅基流动（SiliconFlow）**——国内可直接访问，同时提供 LLM 和 Embedding 模型，一个 key 搞定：

```bash
# .env 里改成（或登录后在「模型设置」页配置）
LLM_BASE_URL=https://api.siliconflow.cn/v1
LLM_API_KEY=sk-xxxxxxxx          # 在 https://cloud.siliconflow.cn 申请
LLM_MODEL=Qwen/Qwen2.5-7B-Instruct

EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1
EMBEDDING_API_KEY=sk-xxxxxxxx    # 同一个 key
EMBEDDING_MODEL=BAAI/bge-m3      # 中文 embedding 效果好
```

其他可选：
- **DeepSeek**：`https://api.deepseek.com/v1`（LLM 好，但无 embedding，需另配）
- **本地 Ollama**：`http://localhost:11434/v1`（完全离线，先 `ollama pull bge-m3`）
- **OpenAI + 代理**：配置 `HTTPS_PROXY` 环境变量

### 清理测试数据

```bash
# 软删除所有文档（向量不删，后续可手动清）
docker exec kqa-postgres psql -U kqa -d kqa -c \
  "UPDATE documents SET deleted_at = now() WHERE deleted_at IS NULL;"

# 重置整个数据库（会丢所有数据，包括用户）
docker exec kqa-postgres psql -U kqa -d kqa -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
pnpm db:migrate
```
