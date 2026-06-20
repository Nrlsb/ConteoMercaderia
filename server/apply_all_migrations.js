const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

// Configurar conexión a la base de datos PostgreSQL local de Supabase
// Por defecto en Supabase CLI, los datos de acceso a PG son:
// Host: localhost (o 127.0.0.1)
// Port: 54322
// User: postgres
// Password: postgres
// Database: postgres
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

console.log('--- Aplicador de Migraciones de Base de Datos ---');
console.log('Intentando conectar a:', connectionString.replace(/:[^:@]+@/, ':****@')); // Ocultar contraseña en log

const client = new Client({
    connectionString: connectionString
});

async function run() {
    try {
        await client.connect();
        console.log('✅ Conexión establecida con PostgreSQL local.');

        const migrationsDir = path.join(__dirname, 'migrations');
        if (!fs.existsSync(migrationsDir)) {
            console.error('❌ No se encontró el directorio de migraciones en server/migrations');
            process.exit(1);
        }

        const files = fs.readdirSync(migrationsDir)
            .filter(file => file.endsWith('.sql'))
            .sort((a, b) => {
                // Ordenar por el número inicial si existe
                const matchA = a.match(/^(\d+)_/);
                const matchB = b.match(/^(\d+)_/);
                if (matchA && matchB) {
                    return parseInt(matchA[1]) - parseInt(matchB[1]);
                }
                if (matchA) return -1;
                if (matchB) return 1;
                return a.localeCompare(b);
            });

        console.log(`Se encontraron ${files.length} archivos de migración.`);

        for (const file of files) {
            console.log(`\n----------------------------------------`);
            console.log(`Aplicando: ${file}...`);
            const filePath = path.join(migrationsDir, file);
            const sql = fs.readFileSync(filePath, 'utf8');

            try {
                // Ejecutamos la migración
                await client.query(sql);
                console.log(`✅ ${file} aplicada con éxito.`);
            } catch (err) {
                // Si el error es que la tabla, columna o política ya existe, no detenemos el proceso
                if (err.message.includes('already exists') || err.message.includes('duplicate')) {
                    console.log(`⚠️ Advertencia en ${file}: Algunos elementos ya existen en la base de datos. Continuando...`);
                    console.log(`   (Detalle: ${err.message})`);
                } else {
                    console.error(`❌ Error en ${file}:`, err.message);
                }
            }
        }

        console.log(`\n========================================`);
        console.log('🎉 Proceso de migraciones finalizado.');
        console.log('========================================\n');

    } catch (err) {
        console.error('❌ Error general al ejecutar las migraciones:', err);
    } finally {
        await client.end();
    }
}

run();
