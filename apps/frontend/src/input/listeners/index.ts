import { setupCompositionListeners } from "./composition";
import { setupInputListeners } from "./input";
import { setupKeyListeners } from "./key";

type SetupInputEventListenersParams = {
  inputEl: HTMLInputElement;
  handleKey: (value: string) => void;
  getCompositionCommittedInInput: () => boolean;
  setCompositionCommittedInInput: (value: boolean) => void;
  getLastCompositionCommitData: () => string;
  setLastCompositionCommitData: (value: string) => void;
};

export function setupInputEventListeners({
  inputEl,
  handleKey,
  getCompositionCommittedInInput,
  setCompositionCommittedInInput,
  getLastCompositionCommitData,
  setLastCompositionCommitData,
}: SetupInputEventListenersParams): void {
  setupInputListeners({
    inputEl,
    handleKey,
    setCompositionCommittedInInput,
    getLastCompositionCommitData,
    setLastCompositionCommitData,
  });
  setupKeyListeners({ inputEl, handleKey });
  setupCompositionListeners({
    inputEl,
    handleKey,
    getCompositionCommittedInInput,
    setCompositionCommittedInInput,
    setLastCompositionCommitData,
  });
}
