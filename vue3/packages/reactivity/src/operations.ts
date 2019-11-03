export const enum OperationTypes {
  // 使用文字字符串而不是数字，以便于检查
  // 调试器事件
  SET = 'set',
  ADD = 'add',
  DELETE = 'delete',
  CLEAR = 'clear',
  GET = 'get',
  HAS = 'has',
  ITERATE = 'iterate'
}
