import type { Model } from "@/lib/types";
import { formatContextWindow, formatParams, formatPrice, modalityList } from "@/lib/tiers";

const MODALITY_ICON: Record<string, string> = {
  text: "T",
  image: "◧",
  video: "▶",
  audio: "♪",
  file: "▤",
};

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-edge bg-surface-2/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

/** OpenRouter-style spec tiles: the numbers people screenshot. */
export default function SpecGrid({ model }: { model: Model }) {
  const inputs = modalityList(model.input_modalities);
  const outputs = modalityList(model.output_modalities);
  const params = formatParams(model.params_b, model.active_params_b);

  return (
    <div className="grid grid-cols-2 gap-2">
      <Cell label="In / out price">
        {model.price_in == null && model.price_out == null ? (
          "—"
        ) : (
          <>
            {formatPrice(model.price_in)} / {formatPrice(model.price_out)}{" "}
            <span className="text-xs font-normal text-muted">per 1M</span>
          </>
        )}
      </Cell>
      <Cell label="Context">{formatContextWindow(model.context_window)}</Cell>
      <Cell label="Modalities">
        {inputs.length === 0 ? (
          "—"
        ) : (
          <span className="flex flex-wrap items-center gap-1 text-xs">
            {inputs.map((m) => (
              <span key={m} className="rounded-sm bg-surface px-1.5 py-0.5" title={m}>
                {MODALITY_ICON[m] ?? m[0].toUpperCase()}
              </span>
            ))}
            <span className="px-0.5 text-muted">→</span>
            {outputs.map((m) => (
              <span key={m} className="rounded-sm bg-surface px-1.5 py-0.5" title={m}>
                {MODALITY_ICON[m] ?? m[0].toUpperCase()}
              </span>
            ))}
          </span>
        )}
      </Cell>
      <Cell label={params ? "Parameters" : "Released"}>
        {params ? (
          <>
            {params}
            {model.is_moe ? (
              <span className="ml-1.5 text-xs font-normal text-muted">MoE</span>
            ) : null}
          </>
        ) : model.release_date ? (
          new Date(model.release_date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })
        ) : (
          "—"
        )}
      </Cell>
      {params && model.release_date && (
        <Cell label="Released">
          {new Date(model.release_date + "T00:00:00").toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </Cell>
      )}
      {model.hf_id && (
        <Cell label="Weights">
          <span className="break-all text-xs font-normal">{model.hf_id}</span>
        </Cell>
      )}
    </div>
  );
}
