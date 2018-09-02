import 'mocha'
import { expect } from 'chai'
import { createBranch, createLeaf, createTwig } from '.'
import { of } from 'rxjs'
import { delay } from 'rxjs/operators'

describe('Leaf', function() {
    it('createLeaf() with a value', function() {
        const leaf = createLeaf(42)
        expect(leaf.value).to.equal(42)
    })
    it('value === read()', function() {
        const leaf = createLeaf(42)
        expect(leaf.value)
            .to.equal(42)
            .and.equal(leaf.read())
    })
    it('write() a value', function() {
        const leaf = createLeaf(NaN)
        leaf.write(42)
        expect(leaf.value).to.equal(42)
    })
    it('write() mirrors to subject()', function() {
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
    it('subscribe() an observable', function() {
        const leaf = createLeaf(NaN)
        leaf.subscribe(of(42))
        expect(leaf.value).to.equal(42)
    })
    it('write() cancels subscribe()', function(done) {
        this.timeout(10000)
        const leaf = createLeaf(NaN)
        leaf.subscribe(of(0).pipe(delay(1)))
        leaf.write(42)
        setTimeout(() => {
            expect(leaf.value).to.equal(42)
            done()
        }, 10)
    })
})
describe('Twig', function() {
    it('createTwig() with a handler', function() {
        const handler = () => 42
        const twig = createTwig(handler)
        expect(twig.handler).to.equal(handler)
    })
    it('value === read()', function() {
        const twig = createTwig(() => 42)
        expect(twig.value)
            .to.equal(42)
            .and.equal(twig.read())
    })
    it('dirty at first', function() {
        const twig = createTwig(() => 42)
        expect(twig.dirty).to.be.true
        expect(twig.value).to.equal(42)
        expect(twig.dirty).to.be.false
    })
    it('call handler only if dirty', function() {
        const twig = createTwig(() => {
            throw 42
        })
        expect(twig.dirty).to.be.true
        expect(() => twig.value).to.throw()
        twig.dirty = false
        expect(() => twig.value).to.not.throw()
    })
    it('use leaves inside handler', function() {
        const leaf_a = createLeaf(0)
        const leaf_b = createLeaf(0)
        expect(leaf_a.value).to.equal(0)
        expect(leaf_b.value).to.equal(0)
        const twig = createTwig(() => leaf_a.read() + leaf_b.read())
        expect(twig.value).to.equal(0)
        leaf_a.write(12)
        expect(twig.value).to.equal(12)
        leaf_b.write(30)
        expect(twig.value).to.equal(42)
    })
})
describe('Branch', function() {
    it('createBranch() with a handler', function() {
        let value = NaN
        const handler = () => {
            value = 42
        }
        const branch = createBranch(handler)
        expect(branch.handler).to.equal(handler)
        expect(value).to.equal(42)
    })
    it('run() a branch manually', function() {
        let value = 40
        const branch = createBranch(() => {
            ++value
        })
        branch.run()
        expect(value).to.equal(42)
    })
    it('remove() a branch permanently', function() {
        let value = 40
        const branch = createBranch(() => {
            value += 2
        })
        branch.remove()
        branch.run()
        expect(value).to.equal(42)
    })
    it('use leaves inside handler', function(done) {
        this.timeout(10000)
        const leaf_a = createLeaf(0)
        const leaf_b = createLeaf(0)
        expect(leaf_a.value).to.equal(0)
        expect(leaf_b.value).to.equal(0)
        let value = NaN
        createBranch(() => {
            value = leaf_a.read() + leaf_b.read()
        })
        expect(value).to.equal(0)
        leaf_a.write(12)
        expect(value).to.equal(0)
        setTimeout(() => {
            expect(value).to.equal(12)
            leaf_b.write(30)
            expect(value).to.equal(12)
            setTimeout(() => {
                expect(value).to.equal(42)
                done()
            }, 1)
        }, 1)
    })
    it('use twigs inside handler', function(done) {
        this.timeout(10000)
        const leaf_a = createLeaf(0)
        const leaf_b = createLeaf(0)
        expect(leaf_a.value).to.equal(0)
        expect(leaf_b.value).to.equal(0)
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
        setTimeout(() => {
            expect(value).to.equal(39)
            leaf_a.write(9)
            leaf_b.write(6)
            expect(value).to.equal(39)
            setTimeout(() => {
                expect(value).to.equal(45)
                done()
            }, 1)
        }, 1)
    })
    it('stop() and run() again', function(done) {
        this.timeout(10000)
        const leaf = createLeaf(0)
        let value = NaN
        const branch = createBranch(() => {
            value = leaf.read()
        })
        expect(value).to.equal(0)
        branch.stop()
        leaf.write(42)
        expect(value).to.equal(0)
        setTimeout(() => {
            expect(value).to.equal(0)
            branch.run()
            expect(value).to.equal(42)
            leaf.write(NaN)
            expect(value).to.equal(42)
            setTimeout(() => {
                expect(value).to.be.NaN
                done()
            }, 1)
        }, 1)
    })
    it('freeze() and unfreeze()', function(done) {
        this.timeout(10000)
        const leaf_a = createLeaf(0)
        const leaf_b = createLeaf(0)
        expect(leaf_a.value).to.equal(0)
        expect(leaf_b.value).to.equal(0)
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
        setTimeout(() => {
            expect(value).to.equal(0)
            leaf_b.write(30)
            expect(value).to.equal(0)
            setTimeout(() => {
                expect(value).to.equal(42)
                done()
            }, 1)
        }, 1)
    })
    it('schedule() a branch manually', function(done) {
        this.timeout(10000)
        let value = 40
        const branch = createBranch(() => {
            ++value
        })
        branch.schedule()
        expect(value).to.equal(41)
        setTimeout(() => {
            expect(value).to.equal(42)
            done()
        }, 1)
    })
    it('schedule() and unschedule()', function(done) {
        this.timeout(10000)
        let value = 40
        const branch = createBranch(() => {
            value += 2
        })
        branch.schedule()
        expect(value).to.equal(42)
        branch.unschedule()
        setTimeout(() => {
            expect(value).to.equal(42)
            done()
        }, 1)
    })
    it('addTeardown()', function() {
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
