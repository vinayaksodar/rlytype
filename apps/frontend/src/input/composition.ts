let isComposing = false;

export function setComposing(value: boolean): void {
  isComposing = value;
}

export function getComposing(): boolean {
  return isComposing;
}
