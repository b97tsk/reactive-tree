export type ScheduleFunc = (callback: (...args: any[]) => void) => void

let scheduleFunc: ScheduleFunc = (callback: (...args: any[]) => void) => {
    setTimeout(callback, 1)
}

export const schedule = (callback: (...args: any[]) => void) => {
    scheduleFunc(callback)
}

schedule.replace = (fn: ScheduleFunc): ScheduleFunc => {
    const s = scheduleFunc
    scheduleFunc = fn
    return s
}
