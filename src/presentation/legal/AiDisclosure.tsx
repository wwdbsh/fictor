import { useId, useState } from "react";

import { AI_DISCLOSURE_TEXT, STATIC_RUNTIME_AI_NOTICE } from "../../content/ai-disclosure";

/** Shared nonmodal production credit for pre-run and active gameplay surfaces. */
export function AiDisclosure() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const triggerId = `${id}-trigger`;
  const panelId = `${id}-panel`;

  return (
    <div className="ai-disclosure">
      <button
        id={triggerId}
        type="button"
        className="ai-disclosure-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        AI 제작 고지
      </button>
      <section id={panelId} className="ai-disclosure-panel" role="region" aria-labelledby={triggerId} hidden={!open}>
        <p>{AI_DISCLOSURE_TEXT}</p>
        <p>{STATIC_RUNTIME_AI_NOTICE}</p>
      </section>
    </div>
  );
}
