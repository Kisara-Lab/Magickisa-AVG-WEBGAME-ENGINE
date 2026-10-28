import type { EngineStore } from "./store";
import type { StoryTest } from "./storyTest";
import { randomId } from "./id";
import { saveSchema } from "./save";

/** Records only declarative actions; unsupported debugging invalidates the take. */
export class RouteRecorder {
  private initialSave;
  private steps: StoryTest["steps"] = [];
  private error = "";
  private unsubscribe: () => void;
  constructor(private store: EngineStore) {
    this.initialSave = saveSchema.parse(structuredClone(store.save));
    this.initialSave.history = [];
    this.initialSave.playerNotes = "";
    this.unsubscribe = store.subscribeEvents((event) => {
      const action = event.action;
      if (!action || this.error) return;
      if (this.steps.length >= 9999) {
        this.error = "录制超过 9999 步，请拆分路线测试。";
        return;
      }
      switch (action.kind) {
        case "advance":
          this.steps.push({ action: "advance", line: action.line });
          break;
        case "choose":
          this.steps.push({ action: "choose", id: action.id });
          break;
        case "input":
          this.steps.push({
            action: "input",
            line: action.line,
            value: action.value,
          });
          break;
        case "read":
          this.steps.push({ action: "read", id: action.id });
          break;
        case "presentation.complete":
          this.steps.push({ action: "presentation.complete" });
          break;
        default:
          this.error =
            "录制期间发生跳转、回退、读档或调试赋值，请重新开始录制。";
      }
    });
  }
  stop(name: string): StoryTest {
    this.unsubscribe();
    if (this.error) throw new Error(this.error);
    const save = this.store.save;
    return {
      id: randomId(),
      name: name.trim() || "预览录制路线",
      initialSave: this.initialSave,
      steps: [
        ...this.steps,
        {
          action: "assert",
          node: save.nodeId,
          line: save.lineId,
          variables: structuredClone(save.variables),
          choices: this.store.runtime.choices.map((c) => c.id),
          unlocked: [...save.unlockedMaterials],
          read: [...save.readMaterials],
          endings: [...save.completedEndings],
        },
      ],
    };
  }
  cancel() {
    this.unsubscribe();
  }
}
