# Output destination and format
Output assets/demo.gif

# Window Geometry (Compact, High Density — No Dead Space)
Set Width 1020
Set Height 540
Set Padding 24
Set Margin 20
Set MarginFill "#0d1117"
Set BorderRadius 12

# Aesthetic Configuration (Catppuccin Mocha Palette)
Set Theme "Catppuccin Mocha"
Set FontFamily "SF Mono"
Set FontSize 22
Set LineHeight 1.3

# Recording Settings
Set TypingSpeed 40ms

# Initial Frame: Clean screen without system login headers
Hide
Type "prompt $G "
Enter
Type "cls"
Enter
Sleep 250ms
Show

# Type and execute guard command
Type "aegis guard --enforce enterprise.invariants"
Sleep 400ms
Enter

# Hold final state showing all 3 scenarios
Sleep 6s

# Pause before loop
Sleep 2s
