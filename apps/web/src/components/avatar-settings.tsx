"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Button } from "@kqa/ui/components/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@kqa/ui/components/dialog";
import { UserAvatar } from "./user-avatar";
import type { Profile } from "./use-profile";

export function AvatarSettings({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => { if (!open) { setFile(null); setError(""); } }, [open]);

  async function save(remove = false) {
    if (busy || (!remove && !file)) return;
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      if (file) body.append("file", file);
      const response = await fetch("/api/profile/avatar", { method: remove ? "DELETE" : "PUT", body: remove ? undefined : body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "头像保存失败");
      await queryClient.cancelQueries({ queryKey: ["profile"] });
      queryClient.setQueryData<Profile>(["profile"], { ...profile, avatarUrl: result.avatarUrl });
      await Promise.all(["profile", "team"].map((key) => queryClient.invalidateQueries({ queryKey: [key] })));
      router.refresh();
      onOpenChange(false);
    } catch (error) { setError(error instanceof Error ? error.message : "头像保存失败，请重试"); }
    finally { setBusy(false); }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => { if (!busy) onOpenChange(nextOpen); }}>
    <DialogContent className="sm:max-w-sm" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>设置头像</DialogTitle><DialogDescription>让团队成员更容易认出你</DialogDescription></DialogHeader>
      <form className="flex flex-col gap-6" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="rounded-full border border-theme-border p-1.5"><UserAvatar name={profile.name} src={preview ?? profile.avatarUrl} className="size-24" /></div>
          <div className="text-center"><p className="text-sm font-medium">{profile.name}</p><p className="mt-1 text-xs text-muted-foreground">{file?.name ?? "支持 JPG、PNG、WebP，最大 2MB"}</p></div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" aria-label="选择头像图片" className="hidden" onChange={(event) => {
            const selected = event.target.files?.[0];
            event.target.value = "";
            if (!selected) return;
            if (!selected.size || selected.size > 2 * 1024 * 1024) { setError("请选择不超过 2MB 的图片"); return; }
            if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type)) { setError("请选择 JPG、PNG 或 WebP 图片"); return; }
            setError(""); setFile(selected);
          }} />
          <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}><Camera />{profile.avatarUrl || file ? "更换图片" : "上传图片"}</Button>
          <p className="text-center text-xs text-muted-foreground">图片将自动裁剪为正方形，保存后同步到团队头像。</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <DialogFooter className="sm:justify-between">
          {profile.avatarUrl && <Button type="button" variant="ghost" disabled={busy} onClick={() => void save(true)}><Trash2 />移除头像</Button>}
          <div className="flex justify-end gap-2 sm:ml-auto">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>取消</Button>
            <Button type="submit" disabled={busy || !file}>{busy && <Loader2 className="animate-spin" />}保存头像</Button>
          </div>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
