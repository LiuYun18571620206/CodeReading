//这里引入了三个数据转换方法，reactive:转换成观察对象,readonly:转换成只读观察对象,toRaw:将基础类型值转变成响应式对象
import { reactive, readonly, toRaw } from './reactive'
//OperationTypes是提供给track和trigger的事件类型
import { OperationTypes } from './operations'
//跟踪事件和触发事件
import { track, trigger } from './effect'
//是否只读的全局锁
import { LOCKED } from './lock'
//isObject:类型判断，是否为Object。hasOwn:目标实例上是否存在这个属性。isSymbol:类型判断，是否为Symbol类型
import { isObject, hasOwn, isSymbol } from '@vue/shared'
//isRef:类型判断，是否为Ref类型
import { isRef } from './ref'

//builtInSymbols保存所有Symbol中的symbol实例属性,他是set数据结构
const builtInSymbols = new Set(
  Object.getOwnPropertyNames(Symbol)
    .map(key => (Symbol as any)[key])
    .filter(isSymbol)
)

//创建访问属性值的Getter函数
function createGetter(isReadonly: boolean) {
  return function get(target: any, key: string | symbol, receiver: any) {
    //获取target[key],如果target[key]设置了get函数，则receiver指定这个get函数的this
    const res = Reflect.get(target, key, receiver)
    //key是否为symbol类型以及key是否为Symbol的实例属性
    if (isSymbol(key) && builtInSymbols.has(key)) {
      return res
    }
    //res是否为Ref类型
    if (isRef(res)) {
      //这里res.value是object[key]
      return res.value
    }
    track(target, OperationTypes.GET, key)
    //检测res是否为一个对象如果是则进行数据转换，isReadonly为true则转换为readonly，反之则转换为reactive，最后返回这个数据
    //这里可以看出reactive并不是一次性转reactive或readonly，而是在每次访问进行转换
    return isObject(res)
      ? (isReadonly ? readonly(res) : reactive(res))
      : res
  }
}
//setter拦截器
function set(
  target: any,
  key: string | symbol,
  value: any,
  receiver: any
): boolean {
  value = toRaw(value)
  const hadKey = hasOwn(target, key)
  const oldValue = target[key]
  //如果设置的是一个Ref类型则修改它的value值
  if (isRef(oldValue) && !isRef(value)) {
    oldValue.value = value
    return true
  }
  //将本次设置行为，映射到原始对象上
  const result = Reflect.set(target, key, value, receiver)
  // 如果是原始数据原型链上的数据操作，不做任何触发监听函数的行为
  if (target === toRaw(receiver)) {
    // istanbul 是个单测覆盖率工具
    /* istanbul ignore else */
    if (__DEV__) {
      // 开发环境下，会传给trigger一个扩展数据，包含了新旧值。明显的是便于开发环境下做一些调试。
      const extraInfo = { oldValue, newValue: value }
      if (!hadKey) {
        // 如果不存在key时，说明是新增属性，操作类型为ADD
        trigger(target, OperationTypes.ADD, key, extraInfo)
      } else if (value !== oldValue) {
        // 运行到else if 意味者hadKey是true 这条判断条件相当于(value!==oldValue&&hadKey)
        // 存在key，则说明为更新操作，当新值与旧值不相等时，才是真正的更新，进而触发trigger
        trigger(target, OperationTypes.SET, key, extraInfo)
      }
    } else {
      //以下是不在开发环境的行为，只是少了extraInfo
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key)
      } else if (value !== oldValue) {
        trigger(target, OperationTypes.SET, key)
      }
    }
  }
  return result
}
//delete行为拦截器
function deleteProperty(target: any, key: string | symbol): boolean {
  const hadKey = hasOwn(target, key)
  const oldValue = target[key]
  const result = Reflect.deleteProperty(target, key)
  if (result && hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      trigger(target, OperationTypes.DELETE, key, { oldValue })
    } else {
      trigger(target, OperationTypes.DELETE, key)
    }
  }
  return result
}
//has行为拦截器
function has(target: any, key: string | symbol): boolean {
  const result = Reflect.has(target, key)
  track(target, OperationTypes.HAS, key)
  return result
}
//ownKeys行为拦截器
function ownKeys(target: any): (string | number | symbol)[] {
  track(target, OperationTypes.ITERATE)
  //返回target的键数组
  return Reflect.ownKeys(target)
}
//reactive的ProxyOptions
export const mutableHandlers: ProxyHandler<any> = {
  get: createGetter(false),
  set,
  deleteProperty,
  has,
  ownKeys
}
//readonly的ProxyOptions
export const readonlyHandlers: ProxyHandler<any> = {
  get: createGetter(true),

  set(target: any, key: string | symbol, value: any, receiver: any): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Set operation on key "${String(key)}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return set(target, key, value, receiver)
    }
  },

  deleteProperty(target: any, key: string | symbol): boolean {
    if (LOCKED) {
      if (__DEV__) {
        console.warn(
          `Delete operation on key "${String(
            key
          )}" failed: target is readonly.`,
          target
        )
      }
      return true
    } else {
      return deleteProperty(target, key)
    }
  },

  has,
  ownKeys
}
