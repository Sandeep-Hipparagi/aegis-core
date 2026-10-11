# VHS Tape configuration for AegisCore Visual Demo
# Install VHS: https://github.com/charmbracelet/vhs
# Run: vhs demo.tape

Output assets/demo.gif

Set FontSize 16
Set Width 1200
Set Height 680
Set Padding 20
Set Theme "Catppuccin Mocha"
Set WindowBar Colorful

Type "node --experimental-strip-types bin/aegis.ts audit verify"
Enter
Sleep 2s

Type "node --experimental-strip-types examples/banking-agent.ts"
Enter
Sleep 6s
