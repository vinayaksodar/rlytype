import { getComposing, setComposing } from "../composition";

type SetupCompositionListenersParams = {
  inputEl: HTMLInputElement;
  handleKey: (value: string) => void;
  getCompositionCommittedInInput: () => boolean;
  setCompositionCommittedInInput: (value: boolean) => void;
  setLastCompositionCommitData: (value: string) => void;
};

export function setupCompositionListeners({
  inputEl,
  handleKey,
  getCompositionCommittedInInput,
  setCompositionCommittedInInput,
  setLastCompositionCommitData,
}: SetupCompositionListenersParams): void {
  inputEl.addEventListener("compositionstart", (e) => {
    console.log("[Composition] start", e);
    setComposing(true);
    setCompositionCommittedInInput(false);
    setLastCompositionCommitData("");
  });

  inputEl.addEventListener("compositionupdate", (e) => {
    console.log(`[Composition] update data: "${e.data}"`);
  });

  inputEl.addEventListener("compositionend", (e) => {
    console.log(`[Composition] end data: "${e.data}"`);
    setComposing(false);

    // Fallback path for browsers that commit on compositionend instead of input.
    if (e.data && !getCompositionCommittedInInput()) {
      handleKey(e.data);
    }

    setCompositionCommittedInInput(false);
    setLastCompositionCommitData("");

    if (!getComposing()) {
      inputEl.value = "";
    }
  });
}
