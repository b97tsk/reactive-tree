import { expect } from 'chai'
import { describe, it } from 'mocha'
import { of } from 'rxjs'
import { delay } from 'rxjs/operators'
import { createBranch, createLeaf, createTwig, schedule } from '.'

describe('Leaf', () => {
    it('createLeaf() with a value', () => {
        const leaf = createLeaf(42)
        expect(leaf.value).to.equal(42)
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
        const leaf = createLeaf(0)
        leaf.subscribe(of(42))
        leaf.subscribe(of(NaN).pipe(delay(1)))
        expect(leaf.value).to.equal(42)
        setTimeout(() => {
            expect(leaf.value).to.be.NaN
            done()
        }, 2)
    })
    it('write() cancels subscribe()', done => {
        const leaf = createLeaf(0)
        leaf.subscribe(of(NaN).pipe(delay(1)))
        leaf.write(42)
        setTimeout(() => {
            expect(leaf.value).to.equal(42)
            done()
        }, 2)
    })
    it('unsubscribe() cancels subscribe()', done => {
        const leaf = createLeaf(42)
        leaf.subscribe(of(NaN).pipe(delay(1)))
        leaf.unsubscribe()
        setTimeout(() => {
            expect(leaf.value).to.equal(42)
            done()
        }, 2)
    })
})
describe('Twig', () => {
    it('createTwig() with a handler', () => {
        const handler = () => 42
        const twig = createTwig(handler)
        expect(twig.handler).to.equal(handler)
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
    it('run() a branch manually', () => {
        let value = 40
        const branch = createBranch(() => {
            ++value
        })
        branch.run()
        expect(value).to.equal(42)
    })
    it('remove() a branch permanently', () => {
        let value = 40
        const branch = createBranch(() => {
            value += 2
        })
        branch.remove()
        branch.run()
        expect(value).to.equal(42)
    })
    it('use leaves inside handler', done => {
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
    it('use twigs inside handler', done => {
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
    it('use branches inside handler (nesting)', done => {
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
    it('stop() and run() again', done => {
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
    it('freeze() and unfreeze()', done => {
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
    it('schedule() a branch manually', done => {
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
    it('schedule() and unschedule()', done => {
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
    it('addTeardown()', () => {
        let value = NaN
        const branch = createBranch(branch => {
            branch.addTeardown(() => {
                value = 42
            })
        })
        expect(value).to.be.NaN
        branch.run()
        expect(value).to.equal(42)
        value = NaN
        branch.stop()
        expect(value).to.equal(42)
    })
})
