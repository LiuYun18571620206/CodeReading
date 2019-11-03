//判断是否为对象以及获取数据的类型
import { isObject, toTypeString } from '@vue/shared'
//可变与b不可变数据代理
//对基本对象的操作拦截
import { mutableHandlers, readonlyHandlers } from './baseHandlers'
//可变集合数据代理与不可变集合数据代理
//对Set, Map, WeakMap, WeakSet的操作拦截
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers
} from './collectionHandlers'
//Ref模块的UnwrapRef类型
import { UnwrapNestedRefs } from './ref'
//通过effect调用返回的反应性函数类型
import { ReactiveEffect } from './effect'

// 存储{target-> key-> dep}连接的主要WeakMap。
// 从概念上讲，将依赖项视为Dep类更容易
// 维持一个Set的集合,但我们将它简化
// 减少原始Set集合以减少内存开销

//下面的结构是一个依赖表
//Dep是一个保存反应性effect函数的Set
export type Dep = Set<ReactiveEffect>
//KeyToDepMap是一个保存Dep的Map,KeyToDepMap的键只能是string或symbol
export type KeyToDepMap = Map<string | symbol, Dep>
//targetMap是记录KeyToDepMap的WeakMap结构，WeakMap的键只能是对象
export const targetMap = new WeakMap<any, KeyToDepMap>()

//weakMaps保存{原始对象<->观察对象}的键值对

//原始对象到reactive对象
const rawToReactive = new WeakMap<any, any>()
//reactive对象到原始对象
const reactiveToRaw = new WeakMap<any, any>()
//原始对象到只读对象
const rawToReadonly = new WeakMap<any, any>()
//只读对象到原始对象
const readonlyToRaw = new WeakMap<any, any>()

// 用于标记只读或非reactive的值的WeakSets
const readonlyValues = new WeakSet<any>()
const nonReactiveValues = new WeakSet<any>()
//采集类型,用来存储Set,Map,WeakMap,WeakSet的构造函数
const collectionTypes = new Set<Function>([Set, Map, WeakMap, WeakSet])
//用来匹配Object.prototype.toString.call(target),符合以下正则即为可观察对象
const observableValueRE = /^\[object (?:Object|Array|Map|Set|WeakMap|WeakSet)\]$/
//判断value是否可观察
const canObserve = (value: any): boolean => {
  return (
    !value._isVue &&
    !value._isVNode &&
    observableValueRE.test(toTypeString(value)) &&
    !nonReactiveValues.has(value)
  )
}
//target参数接受一个对象返回UnwrapNestedRefs类型
export function reactive<T extends object>(target: T): UnwrapNestedRefs<T>
export function reactive(target: object) {
  // 如果尝试观察只读对象，则返回只读版本。
  if (readonlyToRaw.has(target)) {
    return target
  }
  // 目标被用户显式标记为只读，则进行只读数据转换
  if (readonlyValues.has(target)) {
    return readonly(target)
  }
  return createReactiveObject(
    target,
    rawToReactive,
    reactiveToRaw,
    //基本引用类型的拦截器
    mutableHandlers,
    //Set,Map,WeakSet,WeakMap类型的拦截器
    mutableCollectionHandlers
  )
}
//target参数接受一个对象返回只读的UnwrapNestedRefs类型
export function readonly<T extends object>(
  target: T
): Readonly<UnwrapNestedRefs<T>> {
  // 值是可变的可观察值，检索其原始值并返回
  // 如果对象是响应式的则取它的原生对象来进行只读操作
  if (reactiveToRaw.has(target)) {
    target = reactiveToRaw.get(target)
  }
  return createReactiveObject(
    target,
    rawToReadonly,
    readonlyToRaw,
    //基本引用类型的拦截器
    readonlyHandlers,
    //Set,Map,WeakSet,WeakMap类型的拦截器
    readonlyCollectionHandlers
  )
}
//创建反应性对象，接受参数
//target:目标对象,toProxy:用于找到反应性对象的WeakMap,toRaw:用于找到原始对象的WeakMap
//baseHandlers:对基本对象的操作拦截,collectionHandlers:对Set, Map, WeakMap, WeakSet的操作拦截
function createReactiveObject(
  target: any,
  toProxy: WeakMap<any, any>,
  toRaw: WeakMap<any, any>,
  baseHandlers: ProxyHandler<any>,
  collectionHandlers: ProxyHandler<any>
) {
  //如果target不是对象，则不能进行数据转换
  if (!isObject(target)) {
    if (__DEV__) {
      console.warn(`value cannot be made reactive: ${String(target)}`)
    }
    return target
  }
  let observed = toProxy.get(target)
  //判断target是否已经有对应的响应对象
  if (observed !== void 0) {
    return observed
  }
  // 判断target是否已经是响应式对象
  if (toRaw.has(target)) {
    return target
  }
  // 判断target是否可观察，当target不可观察时返回target
  if (!canObserve(target)) {
    return target
  }
  //handlers判断target的构造函数是否为Set, Map, WeakMap, WeakSet,如果是则返回收集处理程序，不是则返回基本处理程序
  const handlers = collectionTypes.has(target.constructor)
    ? collectionHandlers
    : baseHandlers
    //开始创建响应式对象：observed=new Proxy(target,baseHandlers|collectionHandlers)
  observed = new Proxy(target, handlers)
  //用于找到reactive对象的WeakMap保存原始对象和观察对象
  toProxy.set(target, observed)
  //用于找到原始对象的WeakMap保存观察对象和原始对象
  toRaw.set(observed, target)
  //如果targetMap没有target键则添加
  if (!targetMap.has(target)) {
    targetMap.set(target, new Map())
  }
  //返回响应式对象
  return observed
}
//判断是否为Reactive
export function isReactive(value: any): boolean {
  return reactiveToRaw.has(value) || readonlyToRaw.has(value)
}
//判断是否为readonly
export function isReadonly(value: any): boolean {
  return readonlyToRaw.has(value)
}
//获取原始对象
export function toRaw<T>(observed: T): T {
  return reactiveToRaw.get(observed) || readonlyToRaw.get(observed) || observed
}
//标记为只读
export function markReadonly<T>(value: T): T {
  readonlyValues.add(value)
  return value
}
//标记为不Reactive
export function markNonReactive<T>(value: T): T {
  nonReactiveValues.add(value)
  return value
}
