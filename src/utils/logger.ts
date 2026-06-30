/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

type LogType = 'info' | 'success' | 'warn' | 'error';
type LogListener = (message: string, type: LogType) => void;

const listeners = new Set<LogListener>();

export const logger = {
  subscribe(listener: LogListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  log(module: string, message: string, type: LogType) {
    const formattedMessage = `[${module.toUpperCase()}] ${message}`;
    console.log(
      `%c${formattedMessage}`,
      type === 'success'
        ? 'color: #10b981; font-weight: bold;'
        : type === 'error'
        ? 'color: #ef4444; font-weight: bold;'
        : type === 'warn'
        ? 'color: #f59e0b; font-weight: bold;'
        : 'color: #3b82f6;'
    );
    listeners.forEach((listener) => listener(formattedMessage, type));
  },

  info(module: string, message: string) {
    this.log(module, message, 'info');
  },

  success(module: string, message: string) {
    this.log(module, message, 'success');
  },

  warn(module: string, message: string) {
    this.log(module, message, 'warn');
  },

  error(module: string, message: string) {
    this.log(module, message, 'error');
  },

  debug(module: string, message: string) {
    this.log(module, message, 'info');
  },
};
