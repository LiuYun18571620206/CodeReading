//OperationTypes是用来分发track和trigger事件的事件类型
import { OperationTypes } from './operations'
//不知道
import { Dep, targetMap } from './reactive'
//EMPTY_OBJ:空对象，开发环境下是freeze冻结后的对象。 extend是一个继承方法，让第一个参数继承第二个参数的所有属性
import { EMPTY_OBJ, extend } from '@vue/shared'

export const effectSymbol = Symbol(__DEV__ ? 'effect' : void 0)
//reactveEffect函数类型
export interface ReactiveEffect<T = any> {
  //函数调用后返回T类型
  (): T
  //用来判断是否为ReactiveEffect的Symbol
  [effectSymbol]: true
  //活性，stop后活性会变为false
  active: boolean
  //原生,返回自己的原生函数
  raw: () => T
  //由Set<ReactiveEffect<any>>组成的数组
  deps: Array<Dep>
  //标记计算属性
  computed?: boolean
  //调度器，来自配置项的scheduler
  scheduler?: (run: Function) => void
  //追踪事件,来自配置项的onTrack
  onTrack?: (event: DebuggerEvent) => void
  //触发事件,来自配置项的onTrigger
  onTrigger?: (event: DebuggerEvent) => void
  //停止事件,来自配置项的onStop
  onStop?: () => void
}
//ReactiveEffect配置对象的类型
export interface ReactiveEffectOptions {
  //是否需要手动调用开始
  lazy?: boolean
  //?计算
  computed?: boolean
  //调度器,可以看作是节点，当effect因为依赖改变而需要运行时，需要手动运行调度器运行
  scheduler?: (run: Function) => void
  //追踪事件,监听effect内的set操作
  onTrack?: (event: DebuggerEvent) => void
  //触发事件,监听effect的依赖项set
  onTrigger?: (event: DebuggerEvent) => void
  //停止事件,通过stop停止effect时触发
  onStop?: () => void
}
//调试器事件
export interface DebuggerEvent {
  //effect函数
  effect: ReactiveEffect
  //目标对象
  target: any
  //事件类型
  type: OperationTypes
  //目标键
  key: string | symbol | undefined
}
//活性ReactiveEffect栈，这是关键数据
export const activeReactiveEffectStack: ReactiveEffect[] = []
//iterate_key
export const ITERATE_KEY = Symbol('iterate')
//是否为effect函数
export function isEffect(fn: any): fn is ReactiveEffect {
  return fn != null && fn[effectSymbol] === true
}
//这个方法只是两个判断然后调用创建Effect的函数
export function effect<T = any>(
  fn: () => T,
  //Options默认值是空对象
  options: ReactiveEffectOptions = EMPTY_OBJ
): ReactiveEffect<T> {
  //如果fn已经是effect则将target改为它的原生函数
  if (isEffect(fn)) {
    fn = fn.raw
  }
  //创建ReactiveEffect函数，将options的配置复制到新函数上
  const effect = createReactiveEffect(fn, options)
  //如果option未设置lazy则直接调用
  if (!options.lazy) {
    effect()
  }
  return effect
}

export function stop(effect: ReactiveEffect) {
  if (effect.active) {
    cleanup(effect)
    if (effect.onStop) {
      effect.onStop()
    }
    effect.active = false
  }
}

function createReactiveEffect<T = any>(
  fn: () => T,
  options: ReactiveEffectOptions
): ReactiveEffect<T> {
  const effect = function reactiveEffect(...args: any[]): any {
    //每次执行的是run(effect, fn, args)
    return run(effect, fn, args)
  } as ReactiveEffect
  effect[effectSymbol] = true
  effect.active = true
  effect.raw = fn
  effect.scheduler = options.scheduler
  effect.onTrack = options.onTrack
  effect.onTrigger = options.onTrigger
  effect.onStop = options.onStop
  effect.computed = options.computed
  effect.deps = []
  return effect
}

function run(effect: ReactiveEffect, fn: Function, args: any[]): any {
  //如果目标effect不是活的，则直接调用原函数
  if (!effect.active) {
    return fn(...args)
  }
  //这是检查activeReactiveEffectStack中有没有effect,没有则不执行
  if (activeReactiveEffectStack.indexOf(effect) === -1) {
    cleanup(effect)
    // try...finally的执行顺序:finally在try之后运行
    // 首先try块中的activeReactiveEffectStack.push(effect)会最先执行，这条语句不会报错，接下来返回调用fn
    // 如果这时候退出了函数，意味者finally不会运行代码。这里的return被推迟到了finally结束后，但fn(..args)也是在try块中调用的
    // 下面代码的调用顺序是:activeReactiveEffectStack.push(effect) -> TemporarySave=fn(...args) -> 
    // activeReactiveEffectStack.pop() -> return TemporarySave
    try {
      //这应该是effect响应式的开始
      activeReactiveEffectStack.push(effect)
      return fn(...args)
    } finally {
      //这应该是effect响应式的结束
      activeReactiveEffectStack.pop()
    }
  }
}
//将effect数组中的每个Set引用中的effect删除,清空effect的deps数组
function cleanup(effect: ReactiveEffect) {
  const { deps } = effect
  if (deps.length) {
    for (let i = 0; i < deps.length; i++) {
      deps[i].delete(effect)
    }
    deps.length = 0
  }
}
//是否触发跟踪事件
let shouldTrack = true

export function pauseTracking() {
  shouldTrack = false
}

export function resumeTracking() {
  shouldTrack = true
}
//effect响应式的核心，跟踪事件
//跟踪目标的无副作用操作，用targetMap记录
export function track(
  target: any,
  type: OperationTypes,
  key?: string | symbol
) {
  if (!shouldTrack) {
    return
  }
  //effect是activeReactiveEffectStack的最后一个数组成员,也就是刚被推进来的effect函数
  const effect = activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
  if (effect) {
    //如果事件类型是遍历，则key为创建的Symbol符号
    if (type === OperationTypes.ITERATE) {
      key = ITERATE_KEY
    }
    //从targetMap依赖表中取出响应式对象的key依赖集合
    let depsMap = targetMap.get(target)
    //没有则设置一个,depsMap应该是KeyToDepMap类型
    if (depsMap === void 0) {
      targetMap.set(target, (depsMap = new Map()))
    }
    //获取依赖这个key的effect组
    let dep = depsMap.get(key!)
    if (dep === void 0) {
      //使用dep在KeyToDepMap结构设置一个依赖组
      depsMap.set(key!, (dep = new Set()))
    }
    //如果依赖组不含有这个effect的依赖
    if (!dep.has(effect)) {
      //将effect加入到依赖
      dep.add(effect)
      //将这个依赖组推入effect.deps数组
      effect.deps.push(dep)
      if (__DEV__ && effect.onTrack) {
        //开发环境才会调用onTrack用于调试
        effect.onTrack({
          effect,
          target,
          type,
          key
        })
      }
    }
  }
}
//effect响应式的核心，触发事件
//通过targetMap将track跟踪的依赖加入执行集合，然后遍历通过run运行
export function trigger(
  target: any,
  type: OperationTypes,
  key?: string | symbol,
  extraInfo?: any
) {
  const depsMap = targetMap.get(target)
  //获取目标对象的key依赖表
  if (depsMap === void 0) {
    // never been tracked
    // 从未被追踪
    return
  }
  //两个用于存储effect的Set结构
  const effects = new Set<ReactiveEffect>()
  const computedRunners = new Set<ReactiveEffect>()
  //以下代码都是为effects和computedRunners执行集合加入要执行的函数
  //如果事件类型为clear清除
  if (type === OperationTypes.CLEAR) {
    // collection being cleared, trigger all effects for target
    // 收集被清除，触发目标的所有效果
    depsMap.forEach(dep => {
      addRunners(effects, computedRunners, dep)
    })
  } else {
    // schedule runs for SET | ADD | DELETE
    // SET | ADD | DELETE 的情况下
    if (key !== void 0) {
      addRunners(effects, computedRunners, depsMap.get(key))
    }
    // also run for iteration key on ADD | DELETE
    //在 ADD | DELETE 时迭代key
    if (type === OperationTypes.ADD || type === OperationTypes.DELETE) {
      const iterationKey = Array.isArray(target) ? 'length' : ITERATE_KEY
      addRunners(effects, computedRunners, depsMap.get(iterationKey))
    }
  }
  //触发！开始运行
  const run = (effect: ReactiveEffect) => {
    scheduleRun(effect, target, type, key, extraInfo)
  }
  // Important: computed effects must be run first so that computed getters
  // can be invalidated before any normal effects that depend on them are run.
  //重要提示：必须先运行计算的效果，以便计算的吸气剂
  //可以在依赖它们的任何正常效果运行之前将其无效。

  //将收集来的依赖运行
  computedRunners.forEach(run)
  effects.forEach(run)
}
// effects或computedRunners收集effectsToAdd中的effect函数
function addRunners(
  effects: Set<ReactiveEffect>,
  computedRunners: Set<ReactiveEffect>,
  effectsToAdd: Set<ReactiveEffect> | undefined
) {
  if (effectsToAdd !== void 0) {
    effectsToAdd.forEach(effect => {
      if (effect.computed) {
        computedRunners.add(effect)
      } else {
        effects.add(effect)
      }
    })
  }
}

function scheduleRun(
  effect: ReactiveEffect,
  target: any,
  type: OperationTypes,
  key: string | symbol | undefined,
  extraInfo: any
) {
  if (__DEV__ && effect.onTrigger) {
    //在开发环境下运行onTrigger
    effect.onTrigger(
      extend(
        {
          effect,
          target,
          key,
          type
        },
        extraInfo
      )
    )
  }
  //如果调度器存在则将effect传入调度器,否则直接运行effect
  if (effect.scheduler !== void 0) {
    effect.scheduler(effect)
  } else {
    effect()
  }
}
