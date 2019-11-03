//处理的是Set Map WeakSet WeakMap

//toRaw:返回观察对象的原生值，reactive:返回传入对象的观察对象，readonly:返回传入对象的只读观察对象
import { toRaw, reactive, readonly } from './reactive'
//track:跟踪事件，tigger：触发事件
import { track, trigger } from './effect'
//用于为track和tigger提供事件类型
import { OperationTypes } from './operations'
//全局只读锁
import { LOCKED } from './lock'
//isObject：判断传入值是否为一个对象，capitalize：将字符串的第一个字母变成大写，hasOwn：判断Key是否为Object的实例键
import { isObject, capitalize, hasOwn } from '@vue/shared'

const toReactive = (value: any) => (isObject(value) ? reactive(value) : value)
const toReadonly = (value: any) => (isObject(value) ? readonly(value) : value)

function get(target: any, key: any, wrap: (t: any) => any): any {
  //获取target的原生
  target = toRaw(target)
  //获取Key的原生,因为target可能是Map所以Key也可能是一个对象
  key = toRaw(key)
  //proto是target的原型
  const proto: any = Reflect.getPrototypeOf(target)
  //触发跟踪事件
  track(target, OperationTypes.GET, key)
  //原生的get属性获取target的属性值
  const res = proto.get.call(target, key)
  //返回Reactive或Readonly数据转化后的属性值，因为Vue3的响应式是lazy(懒性转变)的
  return wrap(res)
}
//这里的参数列表中的this是规定动态this的类型，这个函数还是只接受一个参数
function has(this: any, key: any): boolean {
  //获取this对象的原生
  const target = toRaw(this)
  //获取key的原生
  key = toRaw(key)
  //proto是target的原型
  const proto: any = Reflect.getPrototypeOf(target)
  //触发跟踪事件
  track(target, OperationTypes.HAS, key)
  //返回原型链的has调用
  return proto.has.call(target, key)
}

function size(target: any) {
  //获取target的原生
  target = toRaw(target)
  //获取target原生的原型
  const proto = Reflect.getPrototypeOf(target)
  //触发跟踪事件
  track(target, OperationTypes.ITERATE)
  //返回原生target原型中的size
  return Reflect.get(proto, 'size', target)
}

function add(this: any, value: any) {
  //add是Set和WeakSet的方法
  //和前面一样获取value的原生
  value = toRaw(value)
  //获取this对象的原生
  const target = toRaw(this)
  //获取this对象的原型
  const proto: any = Reflect.getPrototypeOf(this)
  //检查value是否已存在
  const hadKey = proto.has.call(target, value)
  //给原生对象调用原型链中的add，也就是调用默认add行为
  const result = proto.add.call(target, value)
  if (!hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      //执行触发事件，多传入一个{value}是为了在开发环境下调试
      trigger(target, OperationTypes.ADD, value, { value })
    } else {
      //执行触发事件
      trigger(target, OperationTypes.ADD, value)
    }
  }
  //最后返回默认行为的返回值
  return result
}

function set(this: any, key: any, value: any) {
  //获取value的原生值
  value = toRaw(value)
  //获取this对象的原生
  const target = toRaw(this)
  //获取this对象的原型
  const proto: any = Reflect.getPrototypeOf(this)
  //分别调用原型的方法，是否含有key，旧的value，调用原型的set方法的返回值
  const hadKey = proto.has.call(target, key)
  const oldValue = proto.get.call(target, key)
  const result = proto.set.call(target, key, value)
  //只有新旧值不一样才会触发事件
  if (value !== oldValue) {
    /* istanbul ignore else */
    if (__DEV__) {
      //extraInfo使用来在开发环境下调试的信息
      const extraInfo = { oldValue, newValue: value }
      if (!hadKey) {
        //两种事件类型
        trigger(target, OperationTypes.ADD, key, extraInfo)
      } else {
        trigger(target, OperationTypes.SET, key, extraInfo)
      }
    } else {
      //区别是没有extraInfo
      if (!hadKey) {
        trigger(target, OperationTypes.ADD, key)
      } else {
        trigger(target, OperationTypes.SET, key)
      }
    }
  }
  //返回调用原型的set方法的返回值
  return result
}

function deleteEntry(this: any, key: any) {
  //获取this对象的原生
  const target = toRaw(this)
  //获取this对象的原型
  const proto: any = Reflect.getPrototypeOf(this)
  //target是否含有key
  const hadKey = proto.has.call(target, key)
  //使用原型方法get，这里的判断是因为Set结构没有get方法
  const oldValue = proto.get ? proto.get.call(target, key) : undefined
  // 在排队反应之前转发操作
  const result = proto.delete.call(target, key)
  if (hadKey) {
    /* istanbul ignore else */
    if (__DEV__) {
      //触发跟踪事件，传入oldValue用于调试
      trigger(target, OperationTypes.DELETE, key, { oldValue })
    } else {
      //触发跟踪事件
      trigger(target, OperationTypes.DELETE, key)
    }
  }
  //返回默认行为的返回值
  return result
}

function clear(this: any) {
  //获取this对象的原生
  const target = toRaw(this)
  //获取this对象的原型
  const proto: any = Reflect.getPrototypeOf(this)
  //确认target的size不是0
  const hadItems = target.size !== 0
  //保存旧的target
  const oldTarget = target instanceof Map ? new Map(target) : new Set(target)
  // forward the operation before queueing reactions
  // 在排队反应之前转发操作
  //用默认行为清空target
  const result = proto.clear.call(target)
  if (hadItems) {
    /* istanbul ignore else */
    if (__DEV__) {
      //触发事件，传入oldTarget用于调试
      trigger(target, OperationTypes.CLEAR, void 0, { oldTarget })
    } else {
      //触发事件
      trigger(target, OperationTypes.CLEAR)
    }
  }
  //返回默认事件的返回值
  return result
}

function createForEach(isReadonly: boolean) {
  //isReadonly用来决定返回的函数是否为Readonly提供
  //forEach第一个参数指定对每一项要使用的回调函数，第二个参数指定this指向
  return function forEach(this: any, callback: Function, thisArg?: any) {
    //observed是this对象
    const observed = this
    //target是observed的原生对象
    const target = toRaw(observed)
    //proto是target的原型
    const proto: any = Reflect.getPrototypeOf(target)
    //wrap是转换数据的方法
    const wrap = isReadonly ? toReadonly : toReactive
    //触发跟踪事件
    track(target, OperationTypes.ITERATE)
    // important: create sure the callback is
    // 1. invoked with the reactive map as `this` and 3rd arg
    // 2. the value received should be a corresponding reactive/readonly.

    //重要：确保回调是
    // 1.使用反应式地图“ this”和第3个参数调用
    // 2.收到的值应为相应的反应式/只读。
    function wrappedCallback(value: any, key: any) {
      //wrappedCallback接受两个参数，并传入callback，observed为forEach中第三个参数也就是target
      //值与键会被数据转化，这符合Vue3响应式的lazy
      return callback.call(observed, wrap(value), wrap(key), observed)
    }
    //用原型方法forEach调用，传入参数wrappedCallback，thisArg
    //wrappedCallback会从proto.forEach那里回调接受两个参数
    return proto.forEach.call(target, wrappedCallback, thisArg)
  }
}

function createIterableMethod(method: string | symbol, isReadonly: boolean) {
  //这里的method是指方法名，isReadonly是指服务于Readonly还是Reactive
  //这里method就四个可能值:keys,values,entries,Symbol.iterable
  //这里的传入args参数是在[Symbol.iterable]函数被自定义时使用
  return function(this: any, ...args: any[]) {
    //获取this对象的原生
    const target = toRaw(this)
    //获取target的原型
    const proto: any = Reflect.getPrototypeOf(target)
    //value是否为一对的数据值
    const isPair =
      method === 'entries' ||
      (method === Symbol.iterator && target instanceof Map)
    //使用原型的方法调用，并传入args
    const innerIterator = proto[method].apply(target, args)
    //wrap是数据转化的方法
    const wrap = isReadonly ? toReadonly : toReactive
    //触发跟踪事件
    track(target, OperationTypes.ITERATE)
    // return a wrapped iterator which returns observed versions of the
    // values emitted from the real iterator

    //返回包装好的迭代器，该迭代器返回观察到的
    //真实迭代器发出的值
    return {
      // iterator protocol
      // 迭代器协议
      next() {
        //结构赋值真实遍历器中的value和done
        const { value, done } = innerIterator.next()
        //判断done是否为true，true则迭代器结束
        return done
          ? { value, done }
          : {
            //可以看到value被数据转换
              value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
              done
            }
      },
      // iterable protocol
      // 迭代器协议
      [Symbol.iterator]() {
        return this
      }
    }
  }
}

function createReadonlyMethod(
  method: Function,
  type: OperationTypes
): Function {
  //创建只读方法
  return function(this: any, ...args: any[]) {
    //检测全局只读锁
    if (LOCKED) {
      if (__DEV__) {
        //开发者环境下报警告
        const key = args[0] ? `on key "${args[0]}" ` : ``
        console.warn(
          `${capitalize(type)} operation ${key}failed: target is readonly.`,
          toRaw(this)
        )
      }
      //如果是Delete操作会直接返回false表示失败，其他操作会返回this对象
      return type === OperationTypes.DELETE ? false : this
    } else {
      //全局只读锁未锁的情况下，和Reactive行为一致
      return method.apply(this, args)
    }
  }
}
//reactive的ProxyOptions
//this都是指向Set，Map，WeakSet，WeakMap的，方法是返回后被他们调用的
const mutableInstrumentations: any = {
  get(key: any) {
    return get(this, key, toReactive)
  },
  get size() {
    return size(this)
  },
  has,
  add,
  set,
  delete: deleteEntry,
  clear,
  forEach: createForEach(false)
}
//readonly的ProxyOptions
//this都是指向Set，Map，WeakSet，WeakMap的，方法是返回后被他们调用的
const readonlyInstrumentations: any = {
  get(key: any) {
    return get(this, key, toReadonly)
  },
  get size() {
    return size(this)
  },
  has,
  add: createReadonlyMethod(add, OperationTypes.ADD),
  set: createReadonlyMethod(set, OperationTypes.SET),
  delete: createReadonlyMethod(deleteEntry, OperationTypes.DELETE),
  clear: createReadonlyMethod(clear, OperationTypes.CLEAR),
  forEach: createForEach(true)
}

//这一步是自动为拦截对象提供遍历方法
const iteratorMethods = ['keys', 'values', 'entries', Symbol.iterator]
iteratorMethods.forEach(method => {
  mutableInstrumentations[method] = createIterableMethod(method, false)
  readonlyInstrumentations[method] = createIterableMethod(method, true)
})

function createInstrumentationGetter(instrumentations: any) {
  return function getInstrumented(
    target: any,
    key: string | symbol,
    receiver: any
  ) {
    target =
      //&&优先级高于?
      //这个Getter方法的target一定是Set,Map,WeakSet,WeakMap，这是在Reactive或Readonly中判断过的
      //如果拦截对象和target都有这个key则target为拦截对象，反之不变
      hasOwn(instrumentations, key) && key in target ? instrumentations : target
      //返回对象的"拦截"函数(target为instrumentations的情况，另一种情况是返回undefined或自定义的属性)
    return Reflect.get(target, key, receiver)
  }
}

export const mutableCollectionHandlers: ProxyHandler<any> = {
  get: createInstrumentationGetter(mutableInstrumentations)
}

export const readonlyCollectionHandlers: ProxyHandler<any> = {
  get: createInstrumentationGetter(readonlyInstrumentations)
}
