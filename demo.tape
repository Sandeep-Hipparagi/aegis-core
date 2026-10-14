# Output destination and format
Output assets/demo.gif

# Window Geometry (Compact, High Density — No Dead Space)
Set Width 1020
Set Height 540
Set Padding 18

# Aesthetic Configuration (Catppuccin Mocha Palette)
Set Theme "Catppuccin Mocha"
Set FontFamily "JetBrains Mono"
Set FontSize 14
Set LineHeight 1.25

# Recording Settings
Set TypingSpeed 45ms
Set CursorBlink true

# Initial Frame (Immediate feedback, no blank screen)
Sleep 300ms
Type "node --experimental-strip-types scripts/terminal-demo-v2.js"
Sleep 400ms
Enter

# Let the interactive showcase run and hold the final state
Sleep 7.5s

# Clean end pause before loop
Sleep 2.5s
