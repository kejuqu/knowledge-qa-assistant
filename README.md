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
上传文档 ──> PG documents 表（元数据）──> 切分+embedding ──> Milvus kqa_chunks 集合
                                                              （metadata 带 ownerId 隔离租户）
提问 ──> Milvus 按 ownerId 过滤检索 top-4 ──> 拼装 prompt ──> LLM 流式回答 + 引用来源 ──> 落库 messages
```
