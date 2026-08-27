import Link from "next/link";
import type { Model } from "@/lib/types";
import { formatContextWindow, formatParams, formatPrice, modalityList } from "@/lib/tiers";
import ModalityIcon from "./ModalityIcons";

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-edge bg-surface-2/40 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-1.5 text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

/**
 * The numbers people screenshot. Always the same four tiles under the price
 * banner (missing values render as "—") so every model page looks alike.
 */
export default function SpecGrid({ model }: { model: Model }) {
  const inputs = modalityList(model.input_modalities);
  const outputs = modalityList(model.output_modalities);
  const params = formatParams(model.params_b, model.active_params_b);
  const hasPrice = model.price_in != null || model.price_out != null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border border-edge bg-surface-2/40 p-3">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          In / out price
        </span>
        <span className="text-lg font-bold">
          {hasPrice ? (
            <>
              {formatPrice(model.price_in)}
              <span className="mx-1 font-normal text-muted">/</span>
              {formatPrice(model.price_out)}
            </>
          ) : (
            "—"
          )}
        </span>
        {hasPrice && <span className="text-xs text-muted">per 1M tokens</span>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Cell label="Context">{formatContextWindow(model.context_window)}</Cell>
        <Cell label="Parameters">
          {params ? (
            <>
              {params}
              {model.is_moe ? (
                <span className="ml-1.5 text-xs font-normal text-muted">MoE</span>
              ) : null}
            </>
          ) : (
            <span className="text-muted">Undisclosed</span>
          )}
        </Cell>
        <Cell label="Modalities">
          {inputs.length === 0 ? (
            <span className="text-muted">—</span>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              {inputs.map((m) => (
                <span key={m} className="text-foreground/90">
                  <ModalityIcon kind={m} />
                </span>
              ))}
              <span className="text-xs text-muted">→</span>
              {outputs.map((m) => (
                <span key={m} className="text-foreground/90">
                  <ModalityIcon kind={m} />
                </span>
              ))}
            </span>
          )}
        </Cell>
        <Cell label="Released">
          {model.release_date
            ? new Date(model.release_date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })
            : "—"}
        </Cell>
      </div>

      {model.hf_id && (
        <a
          href={`https://huggingface.co/${model.hf_id}`}
          target="_blank"
          rel="noreferrer noopener"
          className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
        >
          Open weights on Hugging Face
          <span className="font-mono text-[11px] text-foreground/70">{model.hf_id}</span>
          <span aria-hidden>↗</span>
        </a>
      )}
    </div>
  );
}
