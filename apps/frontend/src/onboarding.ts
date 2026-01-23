export interface TourStep {
  elementId?: string; // If null, it's a modal in the center
  title: string;
  content: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
}

export class OnboardingTour {
  private steps: TourStep[];
  private currentStepIndex: number = 0;
  private overlay: HTMLElement;
  private tooltip: HTMLElement;
  private storageKey = "rlytype_tour_seen_v1";

  constructor(steps: TourStep[]) {
    this.steps = steps;
    this.overlay = this.createOverlay();
    this.tooltip = this.createTooltip();

    // Bind methods
    this.next = this.next.bind(this);
    this.prev = this.prev.bind(this);
    this.end = this.end.bind(this);
  }

  public start() {
    if (this.hasSeenTour()) {
      console.log("Tour already seen.");
      return;
    }

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.tooltip);

    // Force reflow
    void this.overlay.offsetHeight;

    this.overlay.classList.add("active");
    this.showStep(0);
  }

  public reset() {
    localStorage.removeItem(this.storageKey);
    this.currentStepIndex = 0;
    this.start();
  }

  private hasSeenTour(): boolean {
    return localStorage.getItem(this.storageKey) === "true";
  }

  private createOverlay(): HTMLElement {
    const el = document.createElement("div");
    el.id = "tour-overlay";
    return el;
  }

  private createTooltip(): HTMLElement {
    const el = document.createElement("div");
    el.className = "tour-tooltip";
    return el;
  }

  private showStep(index: number) {
    if (index < 0 || index >= this.steps.length) {
      this.end();
      return;
    }

    this.currentStepIndex = index;
    const step = this.steps[index];

    // 1. Cleanup previous highlights
    document.querySelectorAll(".tour-highlight").forEach((el) => {
      el.classList.remove("tour-highlight");
      const originalPosition = (el as HTMLElement).dataset.originalPosition;
      if (originalPosition) {
        (el as HTMLElement).style.position = originalPosition;
        delete (el as HTMLElement).dataset.originalPosition;
      } else {
        (el as HTMLElement).style.removeProperty("position");
      }
    });

    // 2. Locate target
    let targetEl: HTMLElement | null = null;
    if (step.elementId) {
      targetEl = document.getElementById(step.elementId);
    }

    // 3. Render Tooltip Content
    this.tooltip.innerHTML = `
      <div class="tour-header">
        <span class="tour-title">${step.title}</span>
        <button class="tour-close" aria-label="Close Tour">&times;</button>
      </div>
      <div class="tour-content">${step.content}</div>
      <div class="tour-footer">
        <div class="tour-progress">${index + 1} / ${this.steps.length}</div>
        <div class="tour-controls">
          ${index > 0 ? `<button class="tour-btn tour-btn-secondary" id="tour-prev">Prev</button>` : ""}
          <button class="tour-btn tour-btn-primary" id="tour-next">${index === this.steps.length - 1 ? "Finish" : "Next"}</button>
        </div>
      </div>
    `;

    // 4. Bind Events
    this.tooltip.querySelector(".tour-close")?.addEventListener("click", this.end);
    this.tooltip.querySelector("#tour-next")?.addEventListener("click", this.next);
    this.tooltip.querySelector("#tour-prev")?.addEventListener("click", this.prev);

    // 5. Positioning
    if (targetEl) {
      const computedStyle = window.getComputedStyle(targetEl);
      if (computedStyle.position === "static") {
        targetEl.dataset.originalPosition = targetEl.style.position || "";
        targetEl.style.position = "relative";
      }
      targetEl.classList.add("tour-highlight");
      this.positionTooltip(targetEl, step.position || "bottom");
    } else {
      // Center modal
      this.positionCenter();
    }

    // Show
    this.tooltip.classList.add("active");
  }

  private positionCenter() {
    this.tooltip.style.top = "50%";
    this.tooltip.style.left = "50%";
    this.tooltip.style.transform = "translate(-50%, -50%)";
    this.tooltip.style.margin = "0";
  }

  private positionTooltip(target: HTMLElement, position: string) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const gap = 12;

    let top = 0;
    let left = 0;

    // Reset transform for absolute positioning logic (except active state)
    this.tooltip.style.transform = "translateY(0)";
    this.tooltip.style.margin = "0";

    switch (position) {
      case "bottom":
        top = rect.bottom + gap + window.scrollY;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2 + window.scrollX;
        break;
      case "top":
        top = rect.top - tooltipRect.height - gap + window.scrollY;
        left = rect.left + rect.width / 2 - tooltipRect.width / 2 + window.scrollX;
        break;
      case "right":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2 + window.scrollY;
        left = rect.right + gap + window.scrollX;
        break;
      case "left":
        top = rect.top + rect.height / 2 - tooltipRect.height / 2 + window.scrollY;
        left = rect.left - tooltipRect.width - gap + window.scrollX;
        break;
    }

    // Boundary checks (Basic)
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10)
      left = window.innerWidth - tooltipRect.width - 10;

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;
  }

  private next() {
    this.showStep(this.currentStepIndex + 1);
  }

  private prev() {
    this.showStep(this.currentStepIndex - 1);
  }

  private end() {
    this.overlay.classList.remove("active");
    this.tooltip.classList.remove("active");

    setTimeout(() => {
      this.overlay.remove();
      this.tooltip.remove();
      document.querySelectorAll(".tour-highlight").forEach((el) => {
        el.classList.remove("tour-highlight");
        const originalPosition = (el as HTMLElement).dataset.originalPosition;
        if (originalPosition) {
          (el as HTMLElement).style.position = originalPosition;
          delete (el as HTMLElement).dataset.originalPosition;
        } else {
          (el as HTMLElement).style.removeProperty("position");
        }
      });
    }, 300);

    localStorage.setItem(this.storageKey, "true");
  }
}
