import type { TemplateDiffItem } from "@/modules/sandbox/template-apply-diff";

export function TemplateDiffList({ items }: { items: TemplateDiffItem[] }) {
  return (
    <div className="sandbox-template-diff">
      {items.map((item) => (
        <div key={item.label} className="sandbox-template-diff-item">
          <div className="sandbox-template-diff-label">{item.label}</div>
          <div className="sandbox-template-diff-row">
            <span className="sandbox-template-diff-tag is-before">当前</span>
            <span className="sandbox-template-diff-value">{item.before}</span>
          </div>
          <div className="sandbox-template-diff-row">
            <span className="sandbox-template-diff-tag is-after">模板</span>
            <span className="sandbox-template-diff-value">{item.after}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
