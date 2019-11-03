
import { track, trigger } from './effect'
//调试器事件，代表事件类型，使用文字字符串，以便于检查
import { OperationTypes } from './operations'
//判断是否为一个对象
import { isObject } from '@vue/shared'
//将对象数据转换成响应式对象数据
import { reactive } from './reactive'

//生成一个唯一key，开发环境下增加描述符 'refSymbol'
export const refSymbol = Symbol(__DEV__ ? 'refSymbol' : '')
//Ref类型
export interface Ref<T = any> {
  //用此唯一key，来做Ref接口的一个描述符，让isRef函数做类型判断
  [refSymbol]: true
  value: UnwrapRef<T>
}
//val是Object则返回reactive(val)，否则直接返回val
const convert = (val: any): any => (isObject(val) ? reactive(val) : val)

//接受泛型T 让T继承Ref raw符合T 返回值符合T
//接受泛型T raw符合T 返回值符合Ref<T>
//兼容模式
export function ref<T extends Ref>(raw: T): T
export function ref<T>(raw: T): Ref<T>
export function ref(raw: any) {
  //如果传入的参数是Ref类型则结束函数
  if (isRef(raw)) {
    return raw
  }
  //如果不是对象则返回raw，是对象则进行reactive数据转换
  raw = convert(raw)
  const v = {
    [refSymbol]: true,
    get value() {
      // 触发track事件
      track(v, OperationTypes.GET, '')
      return raw
    },
    set value(newVal) {
      //将新数据转换
      raw = convert(newVal)
      // 触发trigger事件
      trigger(v, OperationTypes.SET, '')
    }
  }
  return v as Ref
}

//判断是否为Ref类型
export function isRef(v: any): v is Ref {
  return v ? v[refSymbol] === true : false
}
//浅复制对象，并将其key都转化为Ref对象
export function toRefs<T extends object>(
  object: T
): { [K in keyof T]: Ref<T[K]> } {
  const ret: any = {}
  for (const key in object) {
    ret[key] = toProxyRef(object, key)
  }
  return ret
}
//Object[key]是闭包中的函数参数，返回新对象都是访问和修改闭包中的object[key]
function toProxyRef<T extends object, K extends keyof T>(
  object: T,
  key: K
): Ref<T[K]> {
  return {
    [refSymbol]: true,
    get value(): any {
      return object[key]
    },
    set value(newVal) {
      object[key] = newVal
    }
  }
}
// 不应该继续递归的引用数据类型
type BailTypes =
  | Function
  | Map<any, any>
  | Set<any>
  | WeakMap<any, any>
  | WeakSet<any>

  /**!0*0!**/
  //type Parameterss<T extends (...args:any)=>any>=T extends (...args:infer P)=>string?P:never
  //let a:Parameterss<(a,b,c)=>number>=4
  //T extends (...args:any)=>any 是指定泛型T类型要符合后者 
  //=T extends (...args:infer P)=>string?P:never 是检测T是否符合(...args)=>string infer P中的P是待推断的变量
  //(...arg)时 arg的类型为[any,any,any] P就是[any,any,any]
  //T extends (...args:infer P)=>string?P:never 如果T符合 则Parameterss的类型是P 不是则为never
  /**!0*0!**/

// 递归解开嵌套值绑定，泛型T的条件判断
export type UnwrapRef<T> = {
  //如果是ref类型，继续解套
  ref: T extends Ref<infer V> ? UnwrapRef<V> : T
  //如果是数组,循环解套
  array: T extends Array<infer V> ? Array<UnwrapRef<V>> : T
  //如果是对象，遍历解套
  object: { [K in keyof T]: UnwrapRef<T[K]> }
  //停止解套
  stop: T
}[T extends Ref
  ? 'ref'
  : T extends Array<any>
    ? 'array'
    : T extends BailTypes
      ? 'stop' // 避免不应该解包的类型
      : T extends object ? 'object' : 'stop']

// 它是这样的类型：如果该类型已经是Ref，则不需要解套，否则可能是嵌套的ref，走递归解套
export type UnwrapNestedRefs<T> = T extends Ref ? T : UnwrapRef<T>
