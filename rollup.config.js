import typescript from 'rollup-plugin-typescript2'

export default {
    input: 'src/index.ts',
    output: [
        {
            file: 'main.js',
            format: 'cjs',
        },
        {
            file: 'module.js',
            format: 'esm',
        },
    ],
    external: [
        'rxjs',
        'rxjs/operators',
    ],
    plugins: [
        typescript({
            typescript: require('typescript'),
            tsconfigOverride: {
                compilerOptions: {
                    module: 'es2015',
                },
            },
        }),
    ],
}
