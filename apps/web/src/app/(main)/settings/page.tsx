"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@kqa/ui/components/button";
import { Input } from "@kqa/ui/components/input";
import { Label } from "@kqa/ui/components/label";
import { Skeleton } from "@kqa/ui/components/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@kqa/ui/components/card";
import { Loader2, Save } from "lucide-react";

interface ModelSettings {
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  embeddingBaseUrl: string;
  embeddingApiKey: string;
  embeddingModel: string;
  role: "admin" | "member";
}

const FIELDS: Array<{ key: keyof ModelSettings; label: string; hint: string; secret?: boolean }> = [
  { key: "llmBaseUrl", label: "LLM Base URL", hint: "OpenAI 兼容地址；本地 Ollama 填 http://host.docker.internal:11434/v1" },
  { key: "llmApiKey", label: "LLM API Key", hint: "直接传给 LangChain 初始化；本地模型可留空", secret: true },
  { key: "llmModel", label: "LLM 模型名", hint: "如 gpt-4o-mini / qwen3 / deepseek-chat" },
  { key: "embeddingBaseUrl", label: "Embedding Base URL", hint: "向量化服务地址" },
  { key: "embeddingApiKey", label: "Embedding API Key", hint: "", secret: true },
  { key: "embeddingModel", label: "Embedding 模型名", hint: "如 text-embedding-3-small / bge-m3" },
];

export default function SettingsPage() {
  const [form, setForm] = useState<ModelSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const { data } = useQuery<ModelSettings>({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then((r) => r.json()),
  });

  useEffect(() => {
    if (data && !form) setForm(data);
  }, [data, form]);

  async function save() {
    if (!form) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      alert(data.error ?? "保存失败");
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!form) {
    return <SettingsSkeleton />;
  }

  return (
    <div className="p-6">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold">模型设置</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          任何 OpenAI 兼容协议的服务都能接入（OpenAI / DeepSeek / Ollama 本地模型 / 企业网关）
        </p>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader>
            <CardTitle className="text-base">LangChain 模型配置</CardTitle>
            <CardDescription>保存后立即对问答与文档向量化生效</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {FIELDS.map((f) => (
              <div key={f.key} className="space-y-2">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type={f.secret ? "password" : "text"}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                />
                {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              </div>
            ))}
            <Button
              onClick={save}
              disabled={saving || form.role !== "admin"}
              className="w-full"
            >
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
              {saved ? "已保存 ✓" : "保存配置"}
            </Button>
            {form.role !== "admin" && (
              <p className="text-center text-xs text-muted-foreground">
                模型配置是租户级资产，仅管理员可修改
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <div className="p-6" aria-label="正在加载模型设置" role="status">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-4 w-4/5" />
        </div>
        <Card className="border-0 bg-transparent shadow-none">
          <CardHeader className="flex flex-col gap-2">
            <Skeleton className="h-5 w-36" />
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-3 w-3/5" />
              </div>
            ))}
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
