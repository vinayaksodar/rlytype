export interface StatsViewProps {
  wpm: number;
  accuracy: number;
  currentPattern: string;
}

export class StatsRenderer {
  private container: HTMLElement;
  private wpmEl: HTMLElement;
  private accEl: HTMLElement;
  private patternEl: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.style.display = "flex";
    this.container.style.gap = "2rem";
    this.container.style.padding = "1rem 2rem";
    this.container.style.background = "#222";
    this.container.style.color = "#ccc";
    this.container.style.fontFamily = "sans-serif";
    this.container.style.fontSize = "0.9rem";
    this.container.style.borderBottom = "1px solid #333";
    this.container.style.justifyContent = "space-between";

    this.wpmEl = this.createStatBox("WPM", "0");
    this.accEl = this.createStatBox("Accuracy", "100%");
    this.patternEl = this.createStatBox("Current Pattern", "--");
  }

  private createStatBox(label: string, value: string): HTMLElement {
    const box = document.createElement("div");
    box.style.display = "flex";
    box.style.flexDirection = "column";

    const labelEl = document.createElement("span");
    labelEl.textContent = label;
    labelEl.style.fontSize = "0.75rem";
    labelEl.style.textTransform = "uppercase";
    labelEl.style.opacity = "0.6";

    const valEl = document.createElement("span");
    valEl.textContent = value;
    valEl.style.fontSize = "1.2rem";
    valEl.style.fontWeight = "bold";
    valEl.style.color = "#fff";

    box.appendChild(labelEl);
    box.appendChild(valEl);
    this.container.appendChild(box);

    return valEl;
  }

  render(stats: StatsViewProps) {
    this.wpmEl.textContent = stats.wpm.toString();
    this.accEl.textContent = stats.accuracy + "%";
    this.patternEl.textContent = stats.currentPattern || "--";
  }
}
