<?php

if (isset($_POST['submit'])) {
$name = $_POST['name'];
$subject = $_POST['subject'];
$mailTo = $_POST['mail'];
$message = $_POST['message'];

$mailFrom = "rickberends10@gmail.com";
$headers = "From: keep4students";
$txt = "You have received an e-mail from ".$name.".\n\n".$message;

mail($mailTo, $subject, $txt, $headers);
header("Location: index.php?mailsend");
}
