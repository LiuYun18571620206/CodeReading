import { ref, isRef } from '../src/ref'
import { reactive, isReactive, toRaw, markNonReactive } from '../src/reactive'
import { mockWarn } from '@vue/runtime-test'

describe('reactivity/reactive', () => {
  mockWarn()
  //reactive会返回新的反应性对象，并将原对象克隆到新对象
  test('Object', () => {
    //reactive是一种数据转化方法，返回一个拦截原对象行为的新Proxy对象，拦截行为可查阅beseHandlers和collectionHandlers
    const original = { foo: 1 }
    const observed = reactive(original)
    expect(observed).not.toBe(original)
    expect(isReactive(observed)).toBe(true)
    expect(isReactive(original)).toBe(false)
    expect(observed.foo).toBe(1)
    expect('foo' in observed).toBe(true)
    expect(Object.keys(observed)).toEqual(['foo'])
  })
  //reactive会将传入的对象以及成员对象变为反应性的新对象
  test('Array', () => {
    //当然Array也可以设置Proxy，和Object设置Proxy效果差不多。Array本身就是特殊的对象
    const original = [{ foo: 1 }]
    const observed = reactive(original)
    expect(observed).not.toBe(original)
    expect(isReactive(observed)).toBe(true)
    expect(isReactive(original)).toBe(false)
    expect(isReactive(observed[0])).toBe(true)
    expect(observed[0].foo).toBe(1)
    expect(0 in observed).toBe(true)
    expect(Object.keys(observed)).toEqual(['0'])
  })
  //clone的反应性数组应该指向observed的值
  test('cloned reactive Array should point to observed values', () => {
    //reactive数据转换后的对象并不会立刻将嵌套对象转换为reactive对象
    //而是在读取嵌套对象的时候转换，reactive本身会对转换后的对象进行存储记录，访问有记录的对象会直接读取出来reactive对象

    const original = [{ foo: 1 }]
    const observed = reactive(original)
    const clone = observed.slice()
    expect(isReactive(clone[0])).toBe(true)
    expect(clone[0]).not.toBe(original[0])
    expect(clone[0]).toBe(observed[0])
  })
  //嵌套反应，reactive会递归解套将引用类型变为反应性
  test('nested reactives', () => {
    //原理同上
    const original = {
      nested: {
        foo: 1
      },
      array: [{ bar: 2 }]
    }
    const observed = reactive(original)
    expect(isReactive(observed.nested)).toBe(true)
    expect(isReactive(observed.array)).toBe(true)
    expect(isReactive(observed.array[0])).toBe(true)
  })
  //observe的值应该代理改变original对象
  test('observed value should proxy mutations to original (Object)', () => {
    //baseHandle中对set行为进行了拦截

    const original: any = { foo: 1 }
    const observed = reactive(original)
    observed.bar = 1
    expect(observed.bar).toBe(1)
    expect(original.bar).toBe(1)
    delete observed.foo
    expect('foo' in observed).toBe(false)
    expect('foo' in original).toBe(false)
  })
    //observed的值应该代理改变original数组
  test('observed value should proxy mutations to original (Array)', () => {
    //reactive对象的操作都会拦截记录以及映射到原对象
    const original: any[] = [{ foo: 1 }, { bar: 2 }]
    const observed = reactive(original)
    const value = { baz: 3 }
    const reactiveValue = reactive(value)
    observed[0] = value
    expect(observed[0]).toBe(reactiveValue)
    expect(original[0]).toBe(value)
    delete observed[0]
    expect(observed[0]).toBeUndefined()
    expect(original[0]).toBeUndefined()
    // push是变异方法
    observed.push(value)
    expect(observed[2]).toBe(reactiveValue)
    expect(original[2]).toBe(value)
  })
  //?设置一个属性带着未观察的值应该包裹反应性
  test('setting a property with an unobserved value should wrap with reactive', () => {
    //reactive对象只会在读取嵌套值的时候进行reactive转换
    const observed = reactive<{ foo?: object }>({})
    const raw = {}
    observed.foo = raw
    expect(observed.foo).not.toBe(raw)
    expect(isReactive(observed.foo)).toBe(true)
  })
  //观察以及观察到的值应该返回相同的Proxy
  test('observing already observed value should return same Proxy', () => {
    //传入reactive对象会直接返回
    const original = { foo: 1 }
    const observed = reactive(original)
    const observed2 = reactive(observed)
    expect(observed2).toBe(observed)
  })
  //多次观察相同的值应该返回相同的Proxy
  test('observing the same value multiple times should return same Proxy', () => {
    //第二次调用会直接在记录集合Map中找到
    const original = { foo: 1 }
    const observed = reactive(original)
    const observed2 = reactive(original)
    expect(observed2).toBe(observed)
  })
  //不应该污染原始对象与代理人
  test('should not pollute original object with Proxies', () => {
    //reactive中的set操作会对获取newvalue的原生值，然后将操作映射到原生对象上，get操作又会读取回来
    const original: any = { foo: 1 }
    const original2 = { bar: 2 }
    const observed = reactive(original)
    const observed2 = reactive(original2)
    //observed嵌套了observed2
    observed.bar = observed2
    //observed.bar是observed2
    expect(observed.bar).toBe(observed2)
    //observed.bar是original2
    expect(original.bar).toBe(original2)
  })
  //解开，toRaw可以通过反应性对象获取原始对象
  test('unwrap', () => {
    //toRaw是从内部记录集合Map中找到响应对象的原生对象
    const original = { foo: 1 }
    const observed = reactive(original)
    expect(toRaw(observed)).toBe(original)
    expect(toRaw(original)).toBe(original)
  })
  //不应该解开Ref<T>
  test('should not unwrap Ref<T>', () => {
    //isRef是检查对象是否有内部唯一的Symbol符号，reactive并不会消除这个符号
    const observedNumberRef = reactive(ref(1))
    const observedObjectRef = reactive(ref({ foo: 1 }))
    expect(isRef(observedNumberRef)).toBe(true)
    expect(isRef(observedObjectRef)).toBe(true)
  })
  //JS六种基本类型和function?不可成为响应类型
  test('non-observable values', () => {
    //基本类型值无法进行观察，得转换成Ref类型
    const assertValue = (value: any) => {
      reactive(value)
      expect(
        `value cannot be made reactive: ${String(value)}`
      ).toHaveBeenWarnedLast()
    }

    // number
    assertValue(1)
    // string
    assertValue('foo')
    // boolean
    assertValue(false)
    // null
    assertValue(null)
    // undefined
    assertValue(undefined)
    // symbol
    const s = Symbol()
    assertValue(s)

    // built-ins should work and return same value
    // 内置函数不会转为反应性数据，它还是原始值
    const p = Promise.resolve()
    expect(reactive(p)).toBe(p)
    const r = new RegExp('')
    expect(reactive(r)).toBe(r)
    const d = new Date()
    expect(reactive(d)).toBe(d)
  })
  //markNonReactive可以标记不转反应性的值
  test('markNonReactive', () => {
    //内部有用于记录的Set集合
    const obj = reactive({
      foo: { a: 1 },
      bar: markNonReactive({ b: 2 })
    })
    expect(isReactive(obj.foo)).toBe(true)
    expect(isReactive(obj.bar)).toBe(false)
  })
})
