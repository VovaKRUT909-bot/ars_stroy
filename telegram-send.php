<?php
/**
 * Отправка сообщений в Telegram (для форм заказа и замера).
 * Работает на хостинге с PHP. Статический GitHub Pages — сайт использует запасной JS-метод.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'description' => 'method_not_allowed']);
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

$botToken = '8428755203:AAGdq1k0nsg_4EP-eDp2RUfJqi8UWVek78k';
$chatId = '7667524051';
$apiUrl = 'https://api.telegram.org/bot' . $botToken . '/sendMessage';

$payload = http_build_query(
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

if (function_exists('curl_init')) {
    $ch = curl_init($apiUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CONNECTTIMEOUT => 10,
    ]);
    $response = curl_exec($ch);
    curl_close($ch);
}

if ($response === false) {
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $payload,
            'timeout' => 20,
            'ignore_errors' => true,
        ],
    ]);
    $response = @file_get_contents($apiUrl, false, $context);
}

if ($response === false) {
    http_response_code(502);
    echo json_encode(['ok' => false, 'description' => 'telegram_unreachable']);
    exit;
}

http_response_code(200);
echo $response;
