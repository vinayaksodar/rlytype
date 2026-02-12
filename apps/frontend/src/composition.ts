let isComposing = false;

export function setComposing(value: boolean) {
  isComposing = value;
}

export function getComposing() {
  return isComposing;
}
