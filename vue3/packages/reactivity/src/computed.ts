//effect:用于将函数转换为effect响应式函数 ReactiveEffect:effect响应式函数的类型 activeReactiveEffectStack:effect函数的调用堆
import { effect, ReactiveEffect, activeReactiveEffectStack } from './effect'
//Ref:Ref类型 refSymbol:用于鉴别Ref类型的符号 UnwrapRef:Ref的value类型，用于解套的高级类型
import { Ref, refSymbol, UnwrapRef } from './ref'
//isFunction:判断是否为函数 NOOP:没运行任何代码的函数
import { isFunction, NOOP } from '@vue/shared'
//computed返回的类型，value是只读的
export interface ComputedRef<T> extends WritableComputedRef<T> {
  readonly value: UnwrapRef<T>
}
//computed返回的类型
export interface WritableComputedRef<T> extends Ref<T> {
  readonly effect: ReactiveEffect
}
//computed函数传入Options时规定的类型
export interface WritableComputedOptions<T> {
  get: () => T
  set: (v: T) => void
}
//1.接受一个函数，返回对象:只读的effect和value，且继承Ref类型
export function computed<T>(getter: () => T): ComputedRef<T>
//2.接受一个getter函数和setter函数配置对象，返回对象:只读的effect,且继承Ref类型
export function computed<T>(
  options: WritableComputedOptions<T>
): WritableComputedRef<T>
//3.返回值兼容前两种
export function computed<T>(
  getterOrOptions: (() => T) | WritableComputedOptions<T>
): any {
  //传入的参数是否为函数
  const isReadonly = isFunction(getterOrOptions)
  //如果是函数则为getter不是则为参数的get属性
  const getter = isReadonly
    ? (getterOrOptions as (() => T))
    : (getterOrOptions as WritableComputedOptions<T>).get
  //如果是函数且在开发环境下则是一个会报错的setter函数，不是开发环境则是一个空函数
  //不是函数则为参数的set属性
  const setter = isReadonly
    ? __DEV__
      ? () => {
          console.warn('Write operation failed: computed value is readonly')
        }
      : NOOP
    : (getterOrOptions as WritableComputedOptions<T>).set
  //脏
  let dirty = true
  let value: T
  //runner是effect函数
  const runner = effect(getter, {
    lazy: true,
    // mark effect as computed so that it gets priority during trigger
    // 将效果标记为计算，以便在触发期间获得优先级
    computed: true,
    //因为这里设置的调度器，依赖触发tirgger事件只是将dirty变为true
    scheduler: () => {
      dirty = true
    }
  })
  return {
    [refSymbol]: true,
    // expose effect so computed can be stopped
    // 暴露effect，因此可以停止计算
    effect: runner,
    //getter函数运行时判断dirty是否为true，是则重新取值，不是则还是闭包中那个value
    get value() {
      if (dirty) {
        value = runner()
        //重新取值后设置dirty确保不会再重新取值，tirgger事件会将dirty变为true
        dirty = false
      }
      // When computed effects are accessed in a parent effect, the parent
      // should track all the dependencies the computed property has tracked.
      // This should also apply for chained computed properties.
      
      //当在父级效果中访问计算的效果时，父级应该跟踪计算属性跟踪的所有依赖项。
      //这也应适用于链接的计算属性。

      //跟踪computed运行函数,这里是为了让其他effect能够追踪到runner
      //这段有些绕，这个场景是这样的
      //当其他effect函数内部对computed返回的Ref有依赖时
      //computed返回的Ref类型是没有拦截触发track和trigger事件的
      //其他effect内部会有对Ref的value的一个读操作
      //通过这个读操作跟踪runner
      trackChildRun(runner)
      return value
    },
    set value(newValue: T) {
      setter(newValue)
    }
  }
}

function trackChildRun(childRunner: ReactiveEffect) {
  //父级运行函数，也就是刚被推入activeReactiveEffectStack的effect函数(effect模块中)
  //把它看成一个其他运行的effect
  const parentRunner =
    activeReactiveEffectStack[activeReactiveEffectStack.length - 1]
  if (parentRunner) {
    //遍历childRunner的依赖数组，childRunner也是effect函数，他在运行时也有一个依赖数组
    for (let i = 0; i < childRunner.deps.length; i++) {
      //获取依赖数组中的effect依赖(Set结构)，这个引用的终点是响应式对象的key键的effect依赖集合
      const dep = childRunner.deps[i]
      //如果依赖中不存在父effect
      if (!dep.has(parentRunner)) {
        //将父effect加入dep集合
        dep.add(parentRunner)
        //将dep推入父effect的依赖数组
        parentRunner.deps.push(dep)
      }
    }
  }
}
