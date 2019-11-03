// 全局不变性锁
export let LOCKED = true

export function lock() {
  LOCKED = true
}

export function unlock() {
  LOCKED = false
}
