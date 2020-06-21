const { spawnSync } = require('child_process');
try
{
    const p = spawnSync('cmd', ['/c','npx','electron','--inspect','Main.js'],
    {
        stdio:[process.stdin,process.stdout,process.stderr]
    });
}
catch (err)
{
    console.log("spawn error:")
    console.error(err);
}
