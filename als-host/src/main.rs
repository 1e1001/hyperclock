#![expect(
	clippy::print_stdout,
	clippy::cast_possible_truncation,
	clippy::cast_sign_loss,
	reason = "application"
)]

use std::fs::{File, read_to_string};
use std::io::{self, Read, Write};
use std::mem::take;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::{Duration, Instant};

use clap::Parser;
use serial::unix::TTYPort;
use serial::{PortSettings, SerialPort};

/// ambient light sensor host
#[derive(Debug, Parser)]
#[command(version, long_about = None)]
struct Args {
	/// Prefix for serial connection
	serial_path: String,
	/// Prefix for backlight device
	backlight_path: PathBuf,
	/// Black sensor input 0..1024
	light_min: u16,
	/// White sensor input 0..1024
	light_max: u16,
	/// Black screen level 0..=1
	screen_min: f32,
	/// Screen curve exponent
	screen_power: f32,
}

struct State {
	// streams
	serial: TTYPort,
	serial_path: String,
	backlight: File,
	// config
	light_min: u16,
	light_max: u16,
	screen_min: f32,
	screen_max: f32,
	screen_power: f32,
	// stats
	start: Instant,
	reports: u16,
	dropped: u16,
	prev_sec: u64,
	prev_sub: u32,
	prev_reports: u16,
	prev_status: bool,
}

const ERROR_TIMEOUT: Duration = Duration::from_secs(1);

fn open_serial(prefix: &str) -> anyhow::Result<TTYPort> {
	for i in 0..16 {
		let path = format!("{prefix}{i}");
		let res = serial::open(&path);
		match res {
			Ok(mut res) => {
				println!("Connected to {path}");
				res.configure(&PortSettings {
					baud_rate: serial::Baud9600,
					char_size: serial::Bits8,
					parity: serial::ParityNone,
					stop_bits: serial::Stop1,
					flow_control: serial::FlowHardware,
				})?;
				return Ok(res);
			}
			Err(err) if err.kind() == serial::ErrorKind::NoDevice => {}
			Err(err) => return Err(err.into()),
		}
	}
	anyhow::bail!("Failed to find {prefix}*")
}

impl State {
	fn new(args: Args) -> Self {
		let Args {
			serial_path,
			backlight_path,
			light_min,
			light_max,
			screen_min,
			screen_power,
		} = args;
		assert!((0..1024).contains(&light_min), "out of range");
		assert!((0..1024).contains(&light_max), "out of range");
		assert!((0.0..1.0).contains(&screen_min), "out of range");
		let screen_max = read_to_string(backlight_path.join("max_brightness"))
			.expect("failed to read max_brightness")
			.trim()
			.parse::<f32>()
			.expect("bad max_brightness");
		let backlight = File::options()
			.append(true)
			.open(backlight_path.join("brightness"))
			.expect("failed to open brightness");
		println!("max backlight {screen_max:?}");
		Self {
			serial: open_serial(&serial_path).expect("failed to open serial"),
			serial_path,
			backlight,
			light_min,
			light_max,
			screen_min: screen_min * screen_max,
			screen_max,
			screen_power,
			start: Instant::now(),
			reports: 0,
			dropped: 0,
			prev_sec: 0,
			prev_sub: 0,
			prev_reports: 0,
			prev_status: false,
		}
	}
	fn iteration(&mut self) -> anyhow::Result<()> {
		let mut read_buf = [0; 1024];
		let n = loop {
			match self.serial.read(&mut read_buf) {
				Ok(n) if n >= 2 => break n,
				Ok(b) => {
					self.prev_status = false;
					println!("Only got {b} bytes, reconnecting");
					self.serial = open_serial(&self.serial_path)?;
				}
				Err(err) if err.kind() == io::ErrorKind::TimedOut => {}
				Err(err) => return Err(err.into()),
			}
		};
		let light_low = read_buf[n - 2];
		let light_high_buttons = read_buf[n - 1];
		let light = u16::from_le_bytes([light_low, light_high_buttons & 0x0F]);
		let _sw = [0x10, 0x20, 0x40, 0x80].map(|mask| light_high_buttons & mask != 0);
		let mapped_light = ((f32::from(light.min(self.light_max).saturating_sub(self.light_min))
			/ f32::from(self.light_max - self.light_min))
		.powf(self.screen_power)
			* (self.screen_max - self.screen_min)
			+ self.screen_min)
			.round() as usize;
		write!(self.backlight, "{mapped_light}")?;
		self.reports += 1;
		self.dropped = self.dropped.wrapping_add((n / 2).saturating_sub(1) as u16);
		let elapsed = self.start.elapsed();
		let sec = elapsed.as_secs();
		let sub = elapsed.subsec_millis() / 200;
		if sec != self.prev_sec {
			self.prev_sec = sec;
			self.prev_reports = take(&mut self.reports);
		}
		if sub != self.prev_sub {
			self.prev_sub = sub;
			#[expect(clippy::cast_precision_loss, reason = "output")]
			let mapped_pct = (mapped_light as f32) / self.screen_max;
			if self.prev_status {
				print!("\x1b[A\x1b[K");
			}
			println!(
				"{:3}/s ({}) {light:4}, {mapped_pct:?}",
				self.prev_reports, self.dropped
			);
			self.prev_status = true;
		}
		Ok(())
	}
}

fn main() {
	let args = Args::parse();
	println!("{args:?}");
	let mut state = State::new(args);
	loop {
		if let Err(e) = state.iteration() {
			state.prev_status = false;
			println!("Error: {e}");
			sleep(ERROR_TIMEOUT);
		}
	}
}
