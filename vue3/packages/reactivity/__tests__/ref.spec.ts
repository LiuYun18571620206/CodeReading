import { ref, effect, reactive, isRef, toRefs } from '../src/index'
import { computed } from '@vue/runtime-dom'
//反应性数据Ref
describe('reactivity/ref', () => {
  //应该保持一个值
  it('should hold a value', () => {
    //这里的1通过ref调用变成了一个对象，查阅Ref 26-48行
    const a = ref(1)
    expect(a.value).toBe(1)
    a.value = 2
    expect(a.value).toBe(2)
  })
  //应该是反应性的
  it('should be reactive', () => {
    //这里的ref返回的对象，会在set时触发trigger事件，触发trigger事件时这个effect再次运行
    //查阅Ref 26-48行，effect 207-256行
    const a = ref(1)
    let dummy
    effect(() => {
      dummy = a.value
    })
    expect(dummy).toBe(1)
    a.value = 2
    expect(dummy).toBe(2)
  })
  //应该使嵌套的属性具有反应性
  it('should make nested properties reactive', () => {
    //这里ref接受了一个对象，实际上对对象进行了reactive数据转换 Ref  32行
    //访问a.value返回的并非是原对象而是新的reactive对象        Reactive  132行
    //reactive对象会对嵌套属性的读写进行响应trigger和track     baseHandlers  22-85行
    const a = ref({
      count: 1
    })
    let dummy
    effect(() => {
      dummy = a.value.count
    })
    expect(dummy).toBe(1)
    a.value.count = 2
    expect(dummy).toBe(2)
  })
  //嵌套在反应对象中时，应该像普通属性一样工作
  it('should work like a normal property when nested in a reactive object', () => {
    //这是因为reactive对get行为进行了拦截           baseHandle   31-33行
    //a.value++是a.value的set操作(前面讲过),obj.a实际是obj.a.value。 obj.a===a.value   
    const a = ref(1)
    const obj = reactive({
      a,
      b: {
        c: a,
        d: [a]
      }
    })
    let dummy1
    let dummy2
    let dummy3
    effect(() => {
      dummy1 = obj.a
      dummy2 = obj.b.c
      dummy3 = obj.b.d[0]
    })
    expect(dummy1).toBe(1)
    expect(dummy2).toBe(1)
    expect(dummy3).toBe(1)
    a.value++
    expect(dummy1).toBe(2)
    expect(dummy2).toBe(2)
    expect(dummy3).toBe(2)
    obj.a++
    expect(dummy1).toBe(3)
    expect(dummy2).toBe(3)
    expect(dummy3).toBe(3)
  })
  //应该解开嵌套引用类型
  it('should unwrap nested ref in types', () => {
    //如果ref传入参数是ref类型则会直接返回传入的参数  这里a===b
    const a = ref(0)
    const b = ref(a)

    expect(typeof (b.value + 1)).toBe('number')
  })
  //应该解开类型中的嵌套值
  it('should unwrap nested values in types', () => {
    //ref接受一个对象会对传入值进行reactive数据转换，reactive对象数据中访问ref类型的会直接访问它的value
    const a = {
      b: ref(0)
    }

    const c = ref(a)

    expect(typeof (c.value.b + 1)).toBe('number')
  })
  //isRef是判断值是否为Ref对象
  test('isRef', () => {
    expect(isRef(ref(1))).toBe(true)
    //?由此可见computed的返回值会转为Ref对象
    expect(isRef(computed(() => 1))).toBe(true)

    expect(isRef(0)).toBe(false)
    expect(isRef(1)).toBe(false)
    // an object that looks like a ref isn't necessarily a ref —— 看起来像Ref的对象不一定使ref
    // Ref的内部有一个Symbol键来鉴别是否为Ref对象
    expect(isRef({ value: 0 })).toBe(false)
  })
  //
  test('toRefs', () => {
    //toRefs是复制对象属性名，对象[属性名]进行操作映射到原对象的读写操作
    
    //a是反应性对象
    const a = reactive({
      x: 1,
      y: 2
    })
    //toRefs(a)返回了一个对象然后解构赋值x,y
    const { x, y } = toRefs(a)
    //由此可见x和y都变成了ref数据
    expect(isRef(x)).toBe(true)
    expect(isRef(y)).toBe(true)
    expect(x.value).toBe(1)
    expect(y.value).toBe(2)

    // source -> proxy 修改a的x和y，x和y的值也会改变
    a.x = 2
    a.y = 3
    expect(x.value).toBe(2)
    expect(y.value).toBe(3)

    // proxy -> source 修改x和y，a的x和y也会改变
    x.value = 3
    y.value = 4
    expect(a.x).toBe(3)
    expect(a.y).toBe(4)

    // reactivity 反应性
    let dummyX, dummyY
    effect(() => {
      dummyX = x.value
      dummyY = y.value
    })
    expect(dummyX).toBe(x.value)
    expect(dummyY).toBe(y.value)

    // mutating source should trigger effect using the proxy refs
    //变异源应使用代理参考触发效果
    a.x = 4
    a.y = 5
    expect(dummyX).toBe(4)
    expect(dummyY).toBe(5)
  })
})
