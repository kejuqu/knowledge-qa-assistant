import { Card, CardDescription, CardHeader, CardTitle } from "@kqa/ui/components/card";
import { FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";

export interface DocumentItem {
  id: string;
  filename: string;
  sizeBytes: number;
  chunkCount: number;
  status: "processing" | "ready" | "failed";
  createdAt: string;
}

const STATUS_ICON = {
  processing: <Loader2 className="size-4 animate-spin text-muted-foreground" />,
  ready: <CheckCircle2 className="size-4 text-green-600" />,
  failed: <XCircle className="size-4 text-destructive" />,
};

export function DocumentCard({ doc }: { doc: DocumentItem }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 p-4">
        <FileText className="size-5 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <CardTitle className="truncate text-sm">{doc.filename}</CardTitle>
          <CardDescription className="text-xs">
            {(doc.sizeBytes / 1024).toFixed(1)} KB · {doc.chunkCount} 个分块 ·{" "}
            {new Date(doc.createdAt).toLocaleString("zh-CN")}
          </CardDescription>
        </div>
        {STATUS_ICON[doc.status]}
      </CardHeader>
    </Card>
  );
}

export function DocumentList({ docs }: { docs: DocumentItem[] }) {
  return (
    <div className="space-y-2">
      {docs.map((d) => (
        <DocumentCard key={d.id} doc={d} />
      ))}
    </div>
  );
}
