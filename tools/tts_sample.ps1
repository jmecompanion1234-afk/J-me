# Turn a [m:ss] transcript into a spoken wav with Windows text-to-speech, two voices alternating
# by line, so the extension harness can hear a scripted conversation (16 kHz mono).
#   powershell -NoProfile -File tools/tts_sample.ps1 samples/cues.txt sessions/cues.wav
param([string]$In = 'samples/cues.txt', [string]$Out = 'sessions/cues.wav')
Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voices = @($s.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object { $_.VoiceInfo.Name })
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$s.SetOutputToWaveFile((Resolve-Path -LiteralPath (Split-Path -Parent $Out) | ForEach-Object { Join-Path $_ (Split-Path -Leaf $Out) }), $fmt)
$s.Rate = -1
$i = 0
foreach ($line in Get-Content -LiteralPath $In -Encoding UTF8) {
  $t = ($line -replace '^\[\d+:\d+\]\s*', '').Trim()
  if (-not $t) { continue }
  if ($voices.Count -gt 1) { $s.SelectVoice($voices[$i % 2]) }
  $b = New-Object System.Speech.Synthesis.PromptBuilder
  $b.AppendText($t)
  $b.AppendBreak([System.TimeSpan]::FromMilliseconds(900))
  $s.Speak($b)
  $i++
}
$s.SetOutputToNull()
$s.Dispose()
"wrote $Out with voices: $($voices -join ', ')"
