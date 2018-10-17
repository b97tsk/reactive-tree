export default {
    input: 'index.js',
    external: [
        'rxjs',
        'rxjs/operators'
    ],
    output: {
        file: 'bundle.js',
        format: 'umd',
        name: 'rxtree',
        sourcemap: true,
        globals: {
            'rxjs': 'rxjs',
            'rxjs/operators': 'rxjs.operators'
        }
    }
};
