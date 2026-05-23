<?php
/**
 * Отправка заявок в Telegram (заказ, замер).
 * Токен только на сервере: скопируйте telegram-secrets.example.php → telegram-secrets.php
 */
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'description' => 'method_not_allowed']);
    exit;
}

$secretsFile = __DIR__ . '/telegram-secrets.php';
if (!is_file($secretsFile)) {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'description' => 'server_not_configured',
    ]);
    exit;
}

$config = require $secretsFile;
$botToken = isset($config['bot_token']) ? trim((string) $config['bot_token']) : '';
$chatId = isset($config['chat_id']) ? trim((string) $config['chat_id']) : '';

if ($botToken === '' || $chatId === '') {
    http_response_code(500);
    echo json_encode(['ok' => false, 'description' => 'invalid_secrets']);
    exit;
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    $body = $_POST;
}

$text = isset($body['text']) ? trim((string) $body['text']) : '';
if ($text === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'description' => 'empty_text']);
    exit;
}

$apiUrl = 'https://api.telegram-proxy.org/bot' . $botToken . '/sendMessage';

$postFields = http_build_query(
    [
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
    ],
    '',
    '&',
    PHP_QUERY_RFC3986
);

$response = false;
$curlError = '';

if (function_exists('curl_init')) {
    $ch = curl_init($apiUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postFields,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_CONNECTTIMEOUT => 12,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);
    $response = curl_exec($ch);
    if ($response === false) {
        $curlError = curl_error($ch);
    }
    curl_close($ch);
}

if ($response === false) {
    http_response_code(502);
    echo json_encode([
        'ok' => false,
        'description' => $curlError !== '' ? $curlError : 'telegram_unreachable',
    ]);
    exit;
}

$data = json_decode($response, true);
if (!is_array($data) || empty($data['ok'])) {
    http_response_code(502);
    echo $response;
    exit;
}

http_response_code(200);
echo $response;
