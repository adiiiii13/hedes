import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import { coloredText } from '~/utils/terminal';

export class TerminalStore {
  #terminals: Array<{ terminal: ITerminal }> = [];
  
  // Create a basic terminal object to hold the output
  #boltTerminal: ITerminal = {
    cols: 80,
    rows: 24,
    write: (data: string) => {
      for (const { terminal } of this.#terminals) {
        terminal.write(data);
      }
    },
    reset: () => {},
    onData: (cb) => {},
    input: (data: string) => {},
  };

  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(true);

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }
  }
  
  get boltTerminal() {
    return this.#boltTerminal;
  }

  toggleTerminal(value?: boolean) {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  async attachBoltTerminal(terminal: ITerminal) {
    if (!this.#terminals.some(t => t.terminal === terminal)) {
      this.#terminals.push({ terminal });
    }
  }

  detachBoltTerminal(terminal: ITerminal) {
    this.#terminals = this.#terminals.filter((t) => t.terminal !== terminal);
  }

  async attachTerminal(terminal: ITerminal) {
    if (!this.#terminals.some(t => t.terminal === terminal)) {
      this.#terminals.push({ terminal });
    }
  }

  onTerminalResize(cols: number, rows: number) {
    // Handle resize if needed
  }
}
