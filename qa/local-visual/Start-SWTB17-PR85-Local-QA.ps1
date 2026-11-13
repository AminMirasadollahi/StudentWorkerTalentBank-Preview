param([switch]$SelfTest)
# SWTB17 PR85 owner-local visual QA. Windows PowerShell 5.1 compatible.
# Serves only SHA256-verified static build assets from RAM on 127.0.0.1.
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $MyInvocation.MyCommand.Path
$dist=Join-Path $root 'dist'
$manifestPath=Join-Path $root 'SHA256SUMS.txt'
if(-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)){throw 'SWTB17_QA_MANIFEST_MISSING'}
if(-not (Test-Path -LiteralPath $dist -PathType Container)){throw 'SWTB17_QA_BUILD_MISSING'}
$shaExpected=@{}
$files=@{}
foreach($line in [System.IO.File]::ReadAllLines($manifestPath)){
 if($line -notmatch '^([0-9a-fA-F]{64})  (dist/[a-zA-Z0-9._/-]+)$'){throw 'SWTB17_QA_MANIFEST_INVALID_LINE'}
 $rel=$matches[2]; $sha=$matches[1].ToUpperInvariant()
 if($rel -match '(^|/)\.\.?(/|$)' -or $shaExpected.ContainsKey($rel)){throw 'SWTB17_QA_MANIFEST_UNSAFE'}
 $shaExpected[$rel]=$sha
}
if(-not $shaExpected.ContainsKey('dist/index.html') -or $shaExpected.Count -lt 3){
 throw 'SWTB17_QA_MANIFEST_INCOMPLETE'
}
$base=[System.IO.Path]::GetFullPath($root)
$basePrefix=$base.TrimEnd('\')+'\'
foreach($rel in $shaExpected.Keys){
 $relativeWindows=$rel.Replace('/','\')
 $file=[System.IO.Path]::GetFullPath((Join-Path $root $relativeWindows))
 if(-not $file.StartsWith($basePrefix,[StringComparison]::OrdinalIgnoreCase)){
  throw 'SWTB17_QA_PATH_OUTSIDE_PACKAGE'
 }
 if(-not (Test-Path -LiteralPath $file -PathType Leaf)){throw 'SWTB17_QA_ASSET_MISSING'}
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $shaExpected[$rel]){
  throw 'SWTB17_QA_ASSET_HASH_MISMATCH'
 }
 $route='/'+$rel.Substring(5)
 $files[$route]=[System.IO.File]::ReadAllBytes($file)
}
$actual=Get-ChildItem -LiteralPath $dist -Recurse -File
if($actual.Count -ne $shaExpected.Count){throw 'SWTB17_QA_EXTRA_OR_MISSING_ASSETS'}
if($SelfTest){
 Write-Host 'SWTB17_PR85_LOCAL_ASSET_INTEGRITY=PASS'
 Write-Host "ASSETS=$($shaExpected.Count)"
 exit 0
}
$mime=@{'.html'='text/html; charset=utf-8';'.js'='text/javascript; charset=utf-8';
 '.mjs'='text/javascript; charset=utf-8';'.css'='text/css; charset=utf-8';
 '.json'='application/json; charset=utf-8';'.svg'='image/svg+xml';
 '.png'='image/png';'.jpg'='image/jpeg';'.jpeg'='image/jpeg';'.webp'='image/webp';
 '.ico'='image/x-icon';'.woff'='font/woff';'.woff2'='font/woff2'}
$listener=New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback,0)
$listener.Start()
$port=$listener.LocalEndpoint.Port
$address="http://127.0.0.1:$port/"
Write-Host 'SWTB17_PR85_REAL_REACT_QA=READY'
Write-Host "LOCAL_ONLY=$address"
Write-Host 'Business-write RPCs are blocked by the QA browser request guard.'
Write-Host 'Stop: close this console or press Ctrl+C.'
try{Start-Process $address}catch{Write-Host "Open this address in Chrome: $address"}
try{
 while($true){
  $client=$listener.AcceptTcpClient()
  try{
   $client.ReceiveTimeout=5000;$client.SendTimeout=5000
   $stream=$client.GetStream()
   $reader=New-Object System.IO.StreamReader($stream,[Text.Encoding]::ASCII,$false,1024,$true)
   $first=$reader.ReadLine()
   if($null -eq $first -or $first.Length -gt 2048){continue}
   $headers=@{}
   for($i=0;$i -lt 45;$i++){
    $h=$reader.ReadLine()
    if($null -eq $h -or $h -eq ''){break}
    if($h.Length -gt 2048){break}
    $colon=$h.IndexOf(':')
    if($colon -gt 0){$headers[$h.Substring(0,$colon).Trim().ToLowerInvariant()]=$h.Substring($colon+1).Trim()}
   }
   $parts=$first.Split(' ')
   $status='404 Not Found';$payload=[byte[]]@();$type='text/plain; charset=utf-8'
   if($headers['host'] -ne "127.0.0.1:$port"){$status='403 Forbidden'}
   elseif($parts.Length -ge 2 -and $parts[0] -eq 'GET'){
    $route=$parts[1].Split('?')[0]
    if($route -eq '/'){$route='/index.html'}
    if($files.ContainsKey($route)){
     $payload=$files[$route];$status='200 OK'
     $ext=[System.IO.Path]::GetExtension($route).ToLowerInvariant()
     if($mime.ContainsKey($ext)){$type=$mime[$ext]}
     else{$type='application/octet-stream'}
    }
   }
   $csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src https://pmwxryavkrjcdobwkryw.supabase.co; form-action 'none'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'"
   $crlf=[string][char]13+[string][char]10
   $response=("HTTP/1.1 $status","Content-Type: $type","Content-Length: $($payload.Length)",
    "Cache-Control: no-store","X-Content-Type-Options: nosniff","Referrer-Policy: no-referrer",
    "X-Frame-Options: DENY","Content-Security-Policy: $csp","Connection: close","","") -join $crlf
   $b=[Text.Encoding]::ASCII.GetBytes($response)
   $stream.Write($b,0,$b.Length)
   if($payload.Length -gt 0){$stream.Write($payload,0,$payload.Length)}
  }catch{Write-Host 'SWTB17_QA_CLIENT_REQUEST_CLOSED'}
  finally{if($client){$client.Close()}}
 }
}finally{$listener.Stop()}
