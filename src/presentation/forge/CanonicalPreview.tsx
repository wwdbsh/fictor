import type { Track1UiForgeCanonicalPreview } from "../../application";
import { AssetImage } from "../assets";

export function CanonicalPreview({ canonical, compact = false }: { canonical: Track1UiForgeCanonicalPreview; compact?: boolean }) {
  return (
    <section className={`canonical-preview ${compact ? "is-compact" : ""}`} aria-label={`레시피 ${canonical.result.nameKo}`}>
      <div className="preview-materials">
        {canonical.materials.map((material, index) => <figure key={material.materialId}><AssetImage assetRole="HAND" src={material.artSrc} placeholderLabel={material.nameKo} alt="" /><figcaption>{material.nameKo}</figcaption>{index === 0 ? <span aria-hidden="true">＋</span> : null}</figure>)}
      </div>
      <span className="preview-equals" aria-hidden="true">＝</span>
      <figure className="preview-result"><AssetImage assetRole="DISCOVERY_RESULT" src={canonical.result.artSrc} fallbackSrc={canonical.materials[0].artSrc} placeholderLabel={canonical.result.nameKo} alt="" /><figcaption><strong>{canonical.result.nameKo}</strong><span>{canonical.result.effectLabelKo}</span>{canonical.result.artFallbackLabelKo ? <small>{canonical.result.artFallbackLabelKo}</small> : null}</figcaption></figure>
      <p className="preview-recipe"><span>레시피</span> {canonical.materials[0].nameKo} + {canonical.materials[1].nameKo} = <strong>{canonical.result.nameKo}</strong></p>
    </section>
  );
}
