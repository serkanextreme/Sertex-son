import { Reorder } from "framer-motion";
import { SubtaskRow } from "./SubtaskRow";

// İç içe alt görev ağacının bir kardeş grubunu (kök veya bir düğümün çocukları)
// sürükle-sıralanabilir render eder. Özyineleme SubtaskRow ↔ SubtaskTree arasında
// AYRI dosyalar üzerinden kurulur (aynı dosyada olsaydı CRA/babel traverse sonsuz
// döngüye giriyordu — bkz. çözüm notu).
export function SubtaskTree({ nodes = [], parentId = null, depth = 0, ctx }) {
  return (
    <Reorder.Group
      axis="y"
      values={nodes}
      onReorder={(next) => ctx.onReorderChildren(parentId, next)}
      className="space-y-1"
    >
      {nodes.map((s) => (
        <SubtaskRow key={s.id} sub={s} depth={depth} ctx={ctx} />
      ))}
    </Reorder.Group>
  );
}

export default SubtaskTree;
