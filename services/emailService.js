const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = null;
    this.isTestMode = false;
    this.init();
  }

  async init() {
    // Gerçek SMTP bilgileri .env dosyasında varsa onları kullan
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
      console.log('✅ Gerçek SMTP sunucusu yapılandırıldı.');
    } else {
      // Yoksa geliştirme amaçlı Ethereal Email (Test) kullan
      this.isTestMode = true;
      try {
        const testAccount = await nodemailer.createTestAccount();
        this.transporter = nodemailer.createTransport({
          host: "smtp.ethereal.email",
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass,
          },
        });
        console.log('⚠️ Gerçek SMTP ayarları bulunamadı. Ethereal Test Email servisi başlatıldı.');
      } catch (err) {
        console.error('Ethereal hesap oluşturulamadı:', err);
      }
    }
  }

  async sendVerificationEmail(to, token) {
    if (!this.transporter) {
      console.error('Mail gönderici (Transporter) henüz hazır değil.');
      return;
    }

    const verifyUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/?token=${token}`;

    const mailOptions = {
      from: '"AltınTakip Uygulaması" <noreply@altintakip.com>',
      to: to,
      subject: 'Hesabınızı Doğrulayın - AltınTakip',
      text: `Hesabınızı doğrulamak için aşağıdaki bağlantıya tıklayın:\n\n${verifyUrl}\n\nBu bağlantı 24 saat geçerlidir.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 10px;">
          <h2 style="color: #d4a835;">AltınTakip</h2>
          <p>Merhaba,</p>
          <p>İşleminizi tamamlamak ve e-posta adresinizi doğrulamak için lütfen aşağıdaki butona tıklayın:</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}" style="background-color: #d4a835; color: #111; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Hesabımı Doğrula</a>
          </div>
          <p style="color: #71717a; font-size: 0.9em;">Bu bağlantı 24 saat boyunca geçerlidir. Eğer buton çalışmıyorsa aşağıdaki linki tarayıcınıza kopyalayabilirsiniz:</p>
          <p style="color: #71717a; font-size: 0.8em; word-break: break-all;">${verifyUrl}</p>
        </div>
      `
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      if (this.isTestMode) {
        console.log(`\n📧 [TEST MAİLİ GÖNDERİLDİ] Giden maili tarayıcıda görmek için tıklayın: ${nodemailer.getTestMessageUrl(info)}\n`);
      }
      return info;
    } catch (error) {
      console.error('Mail gönderme hatası:', error);
      throw error;
    }
  }
}

module.exports = new EmailService();
