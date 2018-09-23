export type ScheduleFunc = (callback: (...args: any[]) => void) => void

export interface ScheduleObject extends ScheduleFunc {
    replace(fn: ScheduleFunc): ScheduleFunc
}

export const schedule: ScheduleObject = (() => {
    let scheduleFunc: ScheduleFunc = (callback: (...args: any[]) => void) => {
        setTimeout(callback, 1)
    }
    const schedule: any = (callback: (...args: any[]) => void) => {
        scheduleFunc(callback)
    }
    schedule.replace = (fn: ScheduleFunc): ScheduleFunc => {
        const s = scheduleFunc
        scheduleFunc = fn
        return s
    }
    return schedule
})()
