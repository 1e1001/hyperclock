#![expect(
	clippy::print_stdout,
	clippy::cast_precision_loss,
	clippy::cast_sign_loss,
	clippy::cast_possible_truncation,
	reason = "binary"
)]

use std::fs::{File, read_to_string};
use std::io::Write;
use std::mem::replace;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration;

use clap::Parser;
use v4l::buffer::Type;
use v4l::io::mmap::Stream;
use v4l::io::traits::CaptureStream;
use v4l::video::Capture;
use v4l::video::capture::Parameters;
use v4l::{Device, FourCC, Fraction};

/// webcam-based ambient light sensor.
/// This does not send any camera controls (manual focus), so do that manually.
#[derive(Debug, Parser)]
#[command(version, long_about = None)]
struct Args {
	/// Video device name
	video_path: String,
	/// Prefix for backlight device
	backlight_path: PathBuf,
	/// Video format: [w]x[h]@[n]/[d]
	video_format: String,
	/// input value minimum
	light_min: f32,
	/// input value maximum
	light_max: f32,
	/// Black screen level 0..=1
	screen_min: f32,
	/// Screen curve exponent
	screen_power: f32,
}

#[inline(never)]
fn frame_sum(frame: &[u8]) -> u32 {
	// only get the two Y's from YUYV video
	frame
		.as_chunks::<2>()
		.0
		.iter()
		.map(|&[y, _]| u32::from(y))
		.sum::<u32>()
}

const SECOND: Duration = Duration::from_secs(1);

fn main() {
	let Args {
		video_path,
		video_format,
		backlight_path,
		light_min,
		light_max,
		screen_min,
		screen_power,
	} = Args::parse();
	let screen_max = read_to_string(backlight_path.join("max_brightness"))
		.expect("failed to read max_brightness")
		.trim()
		.parse::<f32>()
		.expect("bad max_brightness");
	let screen_min = screen_min * screen_max;
	let mut backlight = File::options()
		.append(true)
		.open(backlight_path.join("brightness"))
		.expect("failed to open brightness");
	let camera = Device::with_path(&video_path).unwrap();
	let (vf_resolution, vf_interval) = video_format.split_once('@').expect("vf bad parts");
	let (resolution_w, resolution_h) = vf_resolution.split_once('x').expect("vf bad resolution");
	let (interval_n, interval_d) = vf_interval.split_once('/').expect("vf bad interval");
	let resolution_w = resolution_w.parse().expect("vf bad width");
	let resolution_h = resolution_h.parse().expect("vf bad height");
	let mut fmt = camera.format().unwrap();
	fmt.width = resolution_w;
	fmt.height = resolution_h;
	fmt.fourcc = FourCC::new(b"YUYV");
	println!("{:?}", camera.set_format(&fmt).unwrap());
	camera
		.set_params(&Parameters::new(Fraction::new(
			interval_n.parse().expect("vf bad width"),
			interval_d.parse().expect("vf bad height"),
		)))
		.unwrap();
	let sum_max = (resolution_w * resolution_h * 255) as f32;
	// why four?
	let mut stream = Stream::with_buffers(&camera, Type::VideoCapture, 4).unwrap();
	println!("max backlight {screen_max:?}, max sum {sum_max:?}");
	let mut prev_time = 0;
	let mut prev_status = false;
	loop {
		let (frame, meta) = match stream.next() {
			Ok(frame) => frame,
			Err(err) => {
				println!("Read error: {err}");
				prev_status = false;
				sleep(SECOND);
				continue;
			}
		};
		let time = meta
			.timestamp
			.sec
			.wrapping_mul(1_000_000)
			.wrapping_add(meta.timestamp.usec);
		// if the frame ever has more than 2²⁴ pixels, this won't work
		let sum = frame_sum(frame);
		let light = sum as f32 / sum_max;
		let dt = time - replace(&mut prev_time, time);
		let mapped_light = (((light.clamp(light_min, light_max) - light_min)
			/ (light_max - light_min))
			.powf(screen_power)
			* (screen_max - screen_min)
			+ screen_min)
			.round() as usize;
		if let Err(err) = write!(backlight, "{mapped_light}") {
			println!("Write error: {err}");
			sleep(SECOND);
			continue;
		}
		#[expect(clippy::cast_precision_loss, reason = "output")]
		let mapped_pct = (mapped_light as f32) / screen_max;
		if prev_status {
			print!("\x1b[A\x1b[K");
		}
		println!(
			"{dt:6}µs, raw={light:.4} ({sum}/{sum_max}), mapped={mapped_pct:.4} ({mapped_light}/{screen_max})"
		);
		prev_status = true;
	}
}
