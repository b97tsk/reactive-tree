import { expect } from 'chai'
import { describe, it } from 'mocha'
import { of, queueScheduler } from 'rxjs'
import { subscribeOn } from 'rxjs/operators'
import {
    connectSignal,
    createBranch,
    createLeaf,
    createSignal,
    createTwig,
    defineLeaf,
    defineTwig,
    when,
    whenever,
    Scheduler,
} from '.'

const schedule = (callback: (...args: any[]) => void) =>
    queueScheduler.schedule(callback)

Scheduler.default.schedule = schedule

describe('Leaf', () => {
    it('createLeaf() with a value', () => {
        const leaf = createLeaf(42)
        expect(leaf.value).to.equal(42)
    })
    it('defineLeaf() for an object', () => {
        const obj = { value: 42 }
        const leaf_a = defineLeaf(obj, 'value')
        const leaf_b = defineLeaf(obj, 'foo', 'bar')
        expect(obj).to.have.property('value', 42)
        expect(obj).to.have.property('foo', 'bar')
        expect(leaf_a.value).to.equal(42)
        expect(leaf_b.value).to.equal('bar')
    })
    it('value === read()', () => {
        const leaf = createLeaf(42)
        expect(leaf.value)
            .to.equal(42)
            .and.equal(leaf.read())
    })
    it('write() a value', () => {
        const leaf = createLeaf(NaN)
        leaf.write(42)
        expect(leaf.value).to.equal(42)
    })
    it('write() mirrors to subject()', () => {
        const leaf = createLeaf(NaN)
        let value = leaf.value
        expect(value).to.be.NaN
        leaf.subject().subscribe(x => {
            value = x
        })
        leaf.value = 42
        expect(value).to.be.NaN
        leaf.write(42)
        expect(value).to.equal(42)
    })
    it('subscribe() an observable', () => {
        const leaf = createLeaf(NaN)
        leaf.subscribe(of(42))
        expect(leaf.value).to.equal(42)
    })
    it('subscribe() two observables', done => {
        schedule(() => {
            const leaf = createLeaf(0)
            leaf.subscribe(of(42))
            leaf.subscribe(of(NaN).pipe(subscribeOn(queueScheduler)))
            expect(leaf.value).to.equal(42)
            schedule(() => {
                expect(leaf.value).to.be.NaN
                done()
            })
        })
    })
    it('write() cancels subscribe()', done => {
        schedule(() => {
            const leaf = createLeaf(0)
            leaf.subscribe(of(NaN).pipe(subscribeOn(queueScheduler)))
            leaf.write(42)
            schedule(() => {
                expect(leaf.value).to.equal(42)
                done()
            })
        })
    })
    it('unsubscribe() cancels subscribe()', done => {
        schedule(() => {
            const leaf = createLeaf(42)
            leaf.subscribe(of(NaN).pipe(subscribeOn(queueScheduler)))
            leaf.unsubscribe()
            schedule(() => {
                expect(leaf.value).to.equal(42)
                done()
            })
        })
    })
})
describe('Twig', () => {
    it('createTwig() with a handler', () => {
        const handler = () => 42
        const twig = createTwig(handler)
        expect(twig.handler).to.equal(handler)
    })
    it('defineTwig() for an object', () => {
        const obj = {}
        const twig = defineTwig(obj, 'foo', () => 42)
        expect(obj).to.have.property('foo', 42)
        expect(twig.value).to.equal(42)
    })
    it('value === read()', () => {
        const twig = createTwig(() => 42)
        expect(twig.value)
            .to.equal(42)
            .and.equal(twig.read())
    })
    it('dirty at first', () => {
        const twig = createTwig(() => 42)
        expect(twig.dirty).to.be.true
        expect(twig.value).to.equal(42)
        expect(twig.dirty).to.be.false
    })
    it('call handler only if dirty', () => {
        const twig = createTwig(() => {
            throw 42
        })
        expect(twig.dirty).to.be.true
        expect(() => twig.value).to.throw()
        expect(twig.dirty).to.be.true
        twig.dirty = false
        expect(() => twig.value).to.not.throw()
    })
    it('use leaves inside handler', () => {
        const leaf_a = createLeaf(0)
        const leaf_b = createLeaf(0)
        const twig = createTwig(() => leaf_a.read() + leaf_b.read())
        expect(twig.value).to.equal(0)
        leaf_a.write(12)
        expect(twig.value).to.equal(12)
        leaf_b.write(30)
        expect(twig.value).to.equal(42)
    })
    it('use signals inside handler', done => {
        schedule(() => {
            const signal = createSignal(
                of(1, 2, 3).pipe(subscribeOn(queueScheduler))
            )
            let value = 0
            const twig = createTwig(() => {
                connectSignal(signal)
                return ++value
            })
            expect(twig.value).to.equal(1)
            schedule(() => {
                expect(twig.value).to.equal(2)
                done()
            })
        })
    })
    it('notify() a change', () => {
        const twig_a = createTwig(() => 42)
        const twig_b = createTwig(() => twig_a.read())
        expect(twig_b.dirty).to.be.true
        expect(twig_b.value).to.equal(42)
        expect(twig_b.dirty).to.be.false
        twig_a.notify()
        expect(twig_b.dirty).to.be.true
    })
})
describe('Branch', () => {
    it('createBranch() with a handler', () => {
        let value = NaN
        const handler = () => {
            value = 42
        }
        const branch = createBranch(handler)
        expect(branch.handler).to.equal(handler)
        expect(value).to.equal(42)
    })
    it('createBranch() with a handler and a scheduler', () => {
        let value = NaN
        const handler = () => {
            value = 42
        }
        const scheduler = new Scheduler(schedule)
        const branch = createBranch(scheduler, handler)
        expect(branch.handler).to.equal(handler)
        expect(value).to.equal(42)
    })
    it('run() a branch manually', () => {
        let value = 40
        const branch = createBranch(() => {
            ++value
        })
        branch.run()
        expect(value).to.equal(42)
    })
    it('dispose() a branch', () => {
        let value = 40
        const branch = createBranch(() => {
            value += 2
        })
        branch.dispose()
        branch.run()
        expect(value).to.equal(42)
    })
    it('use leaves inside handler', done => {
        schedule(() => {
            const leaf_a = createLeaf(0)
            const leaf_b = createLeaf(0)
            let value = NaN
            createBranch(() => {
                value = leaf_a.read() + leaf_b.read()
            })
            expect(value).to.equal(0)
            leaf_a.write(12)
            expect(value).to.equal(0)
            schedule(() => {
                expect(value).to.equal(12)
                leaf_b.write(30)
                expect(value).to.equal(12)
                schedule(() => {
                    expect(value).to.equal(42)
                    done()
                })
            })
        })
    })
    it('use twigs inside handler', done => {
        schedule(() => {
            const leaf_a = createLeaf(0)
            const leaf_b = createLeaf(0)
            const twig_a = createTwig(() => leaf_a.read() + leaf_b.read())
            const twig_b = createTwig(() => leaf_a.read() - leaf_b.read())
            let value = NaN
            createBranch(() => {
                value = twig_a.read() * twig_b.read()
            })
            expect(value).to.equal(0)
            leaf_a.write(8)
            leaf_b.write(5)
            expect(value).to.equal(0)
            schedule(() => {
                expect(value).to.equal(39)
                leaf_a.write(9)
                leaf_b.write(6)
                expect(value).to.equal(39)
                schedule(() => {
                    expect(value).to.equal(45)
                    done()
                })
            })
        })
    })
    it('use signals inside handler', done => {
        schedule(() => {
            const signal = createSignal(
                of(1, 2, 3).pipe(subscribeOn(queueScheduler))
            )
            let value = 0
            createBranch(() => {
                connectSignal(signal)
                value++
            })
            expect(value).to.equal(1)
            schedule(() => {
                // Branches schedule to run when they receive a signal.
                expect(value).to.equal(1)
                schedule(() => {
                    expect(value).to.equal(2)
                    done()
                })
            })
        })
    })
    it('use branches inside handler (nesting)', done => {
        schedule(() => {
            const leaf_a = createLeaf(3)
            const leaf_b = createLeaf(5)
            let value = 0
            createBranch(() => {
                value += leaf_a.read()
                createBranch(() => {
                    value += leaf_b.read()
                })
            })
            expect(value).to.equal(3 + 5) // 8
            leaf_a.write(7)
            schedule(() => {
                expect(value).to.equal(8 + 7 + 5) // 20
                leaf_b.write(11)
                schedule(() => {
                    expect(value).to.equal(20 + 11) // 31
                    done()
                })
            })
        })
    })
    it('stop() and run() again', done => {
        schedule(() => {
            const leaf = createLeaf(0)
            let value = NaN
            const branch = createBranch(() => {
                value = leaf.read()
            })
            expect(value).to.equal(0)
            branch.stop()
            leaf.write(42)
            expect(value).to.equal(0)
            schedule(() => {
                expect(value).to.equal(0)
                branch.run()
                expect(value).to.equal(42)
                leaf.write(NaN)
                expect(value).to.equal(42)
                schedule(() => {
                    expect(value).to.be.NaN
                    done()
                })
            })
        })
    })
    it('freeze() and unfreeze()', done => {
        schedule(() => {
            const leaf_a = createLeaf(0)
            const leaf_b = createLeaf(0)
            let value = NaN
            createBranch(branch => {
                branch.freeze()
                const a = leaf_a.read()
                branch.unfreeze()
                const b = leaf_b.read()
                value = a + b
            })
            expect(value).to.equal(0)
            leaf_a.write(12)
            expect(value).to.equal(0)
            schedule(() => {
                expect(value).to.equal(0)
                leaf_b.write(30)
                expect(value).to.equal(0)
                schedule(() => {
                    expect(value).to.equal(42)
                    done()
                })
            })
        })
    })
    it('schedule() a branch manually', done => {
        schedule(() => {
            let value = 40
            const branch = createBranch(() => {
                ++value
            })
            branch.schedule()
            expect(value).to.equal(41)
            schedule(() => {
                expect(value).to.equal(42)
                done()
            })
        })
    })
    it('schedule() and unschedule()', done => {
        schedule(() => {
            let value = 40
            const branch = createBranch(() => {
                value += 2
            })
            branch.schedule()
            expect(value).to.equal(42)
            branch.unschedule()
            schedule(() => {
                expect(value).to.equal(42)
                done()
            })
        })
    })
    it('teardown() and finalize()', () => {
        let value = NaN
        let finalized = false
        const branch = createBranch(branch => {
            branch.teardown(() => {
                value = 42
            })
        })
        branch.finalize(() => {
            finalized = true
        })
        expect(value).to.be.NaN
        expect(finalized).to.be.false
        branch.run()
        expect(value).to.equal(42)
        expect(finalized).to.be.false
        value = NaN
        branch.stop()
        expect(value).to.equal(42)
        expect(finalized).to.be.false
        branch.dispose()
        expect(finalized).to.be.true
    })
    it('when()', done => {
        schedule(() => {
            let whenTriggered = false
            const leaf = createLeaf(0)
            const branch = when(
                () => leaf.read() === 2,
                () => {
                    whenTriggered = true
                }
            )
            expect(whenTriggered).to.be.false
            expect(branch.disposed).to.be.false
            leaf.write(1)
            expect(whenTriggered).to.be.false
            expect(branch.disposed).to.be.false
            schedule(() => {
                expect(whenTriggered).to.be.false
                expect(branch.disposed).to.be.false
                leaf.write(2)
                expect(whenTriggered).to.be.false
                expect(branch.disposed).to.be.false
                schedule(() => {
                    expect(whenTriggered).to.be.true
                    expect(branch.disposed).to.be.true
                    done()
                })
            })
        })
    })
    it('whenever()', done => {
        schedule(() => {
            const leaf = createLeaf(0)
            let currentValue = NaN
            const branch = whenever(
                () => leaf.read(),
                (value, branch) => {
                    currentValue = value
                    if (value === 2) {
                        branch.dispose()
                    }
                }
            )
            expect(currentValue).to.be.NaN
            expect(branch.disposed).to.be.false
            leaf.write(1)
            expect(currentValue).to.be.NaN
            expect(branch.disposed).to.be.false
            schedule(() => {
                expect(currentValue).to.equal(1)
                expect(branch.disposed).to.be.false
                leaf.write(2)
                expect(currentValue).to.equal(1)
                expect(branch.disposed).to.be.false
                schedule(() => {
                    expect(currentValue).to.equal(2)
                    expect(branch.disposed).to.be.true
                    done()
                })
            })
        })
    })
})
